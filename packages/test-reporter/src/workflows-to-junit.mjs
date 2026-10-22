import { globSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const DEFAULT_REPOSITORY = 'iray-tno/hozo'

// Workflows that exist to deploy this report, manage the release PR, check PR
// metadata, or bootstrap initial registry credentials once by hand. Every
// other workflow in `.github/workflows/` is a verification suite whose latest
// run belongs in the report.
const EXCLUDED_WORKFLOWS = new Set([
  'bootstrap-publish.yml',
  'deploy-pages.yml',
  'pr-title.yml',
  'version.yml',
])

const BOILERPLATE_STEP =
  /^(?:Set up job|Complete job|Post Run\b|Run actions\/(?:checkout|setup-node|setup-java|upload-artifact|download-artifact)@|Run pnpm\/action-setup@|Run dtolnay\/rust-toolchain@|Run Swatinem\/rust-cache@|Run gradle\/actions\/setup-gradle@)/

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

export function normalizeJobName(name) {
  const raw = String(name ?? '').trim()
  const fallbackMatch = raw.match(/\|\|\s*'([^']+)'\s*$/)
  if (fallbackMatch) return fallbackMatch[1]
  return raw || 'job'
}

export function discoverWorkflows(root = repositoryRoot) {
  const files = globSync('.github/workflows/*.yml', { cwd: root })
    .map((file) => basename(file.replaceAll('\\', '/')))
    .filter((file) => !EXCLUDED_WORKFLOWS.has(file))
    .sort()

  return files.map((file) => {
    const source = readFileSync(join(root, '.github', 'workflows', file), 'utf8')
    const slug = file.replace(/\.ya?ml$/, '')
    const nameMatch = source.match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)
    return {
      file,
      slug,
      name: nameMatch?.[1]?.trim() || slug,
    }
  })
}

export function selectCandidateRuns(runs) {
  if (!Array.isArray(runs)) return []
  const seen = new Set()
  const executed = runs.filter((run) => {
    if (!run || typeof run !== 'object' || seen.has(run.id)) return false
    seen.add(run.id)
    return (
      run.status === 'completed' &&
      (run.conclusion === 'success' ||
        run.conclusion === 'failure' ||
        run.conclusion === 'timed_out')
    )
  })
  executed.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

  // Prefer runs on main, release tags, or passing verification runs so an
  // in-progress PR branch failure never paints main red, while genuine main
  // failures and PR-only path-filtered workflows are both represented.
  const trusted = executed.filter(
    (run) =>
      run.head_branch === 'main' ||
      /^v\d+\.\d+\.\d+/.test(String(run.head_branch ?? '')) ||
      run.conclusion === 'success',
  )
  return trusted.length > 0 ? trusted : executed
}

function durationSeconds(startedAt, completedAt) {
  const start = Date.parse(startedAt ?? '')
  const stop = Date.parse(completedAt ?? '')
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop < start) return 0
  return (stop - start) / 1000
}

function meaningfulSteps(steps) {
  if (!Array.isArray(steps)) return []
  return steps
    .filter((step) => {
      if (!step || typeof step !== 'object') return false
      if (step.conclusion === 'skipped') return false
      const failed = step.conclusion === 'failure' || step.conclusion === 'timed_out'
      if (!failed && BOILERPLATE_STEP.test(String(step.name ?? ''))) return false
      return true
    })
    .map((step) => {
      const firstLine =
        String(step.name ?? 'step')
          .split(/\r?\n/)[0]
          .trim() || 'step'
      const status =
        step.conclusion === 'failure' || step.conclusion === 'timed_out'
          ? 'failed'
          : step.conclusion === 'cancelled'
            ? 'broken'
            : 'passed'
      return {
        name: firstLine,
        status,
        conclusion: step.conclusion ?? 'unknown',
        seconds: durationSeconds(step.started_at, step.completed_at),
      }
    })
}

export function workflowJobsToJUnit(workflow, jobEntries) {
  const failures = jobEntries.filter(({ job }) => job.conclusion !== 'success').length
  const totalTime = jobEntries
    .reduce((sum, { job }) => sum + durationSeconds(job.started_at, job.completed_at), 0)
    .toFixed(3)

  const cases = jobEntries
    .map(({ run, job }) => {
      const jobName = normalizeJobName(job.name)
      const seconds = durationSeconds(job.started_at, job.completed_at).toFixed(3)
      const steps = meaningfulSteps(job.steps)
      const failedStep = steps.find((step) => step.status === 'failed')
      const sha = String(run.head_sha ?? '').slice(0, 8)
      const completedAt = job.completed_at || run.updated_at || run.created_at || ''
      const failureXml =
        job.conclusion === 'success'
          ? ''
          : `\n      <failure message="${escapeXml(
              failedStep
                ? `${jobName} failed at "${failedStep.name}" (${job.conclusion})`
                : `${jobName} concluded with ${job.conclusion}`,
            )}" type="${escapeXml(job.conclusion ?? 'failure')}">${escapeXml(
              `Run: ${run.html_url ?? ''}\nJob: ${job.html_url ?? ''}\nBranch: ${run.head_branch ?? ''} (${sha})\nEvent: ${run.event ?? ''}\nCompleted: ${completedAt}`,
            )}</failure>`

      const stepsXml = steps
        .map(
          (step) =>
            `\n      <step name="${escapeXml(step.name)}" status="${escapeXml(step.status)}" time="${step.seconds.toFixed(3)}" />`,
        )
        .join('')

      const summaryLines = [
        `Workflow: ${workflow.name} (.github/workflows/${workflow.file})`,
        `Job: ${jobName} (${job.conclusion})`,
        `Event: ${run.event ?? 'unknown'} on ${run.head_branch ?? 'unknown'}${sha ? ` @ ${sha}` : ''}`,
        `Completed: ${completedAt}`,
        ...(job.html_url ? [`Job URL: ${job.html_url}`] : []),
        ...(run.html_url ? [`Run URL: ${run.html_url}`] : []),
        ...(steps.length > 0
          ? [
              '',
              'Executed verification steps:',
              ...steps.map(
                (step) => `  [${step.conclusion}] ${step.name} (${step.seconds.toFixed(1)}s)`,
              ),
            ]
          : []),
      ].join('\n')

      return `    <testcase name="${escapeXml(jobName)}" classname="workflow.${escapeXml(workflow.slug)}" time="${seconds}" file=".github/workflows/${escapeXml(workflow.file)}" run-url="${escapeXml(run.html_url ?? '')}" job-url="${escapeXml(job.html_url ?? '')}" branch="${escapeXml(run.head_branch ?? '')}" sha="${escapeXml(sha)}" event="${escapeXml(run.event ?? '')}" completed-at="${escapeXml(completedAt)}">${failureXml}${stepsXml}
      <system-out>${escapeXml(summaryLines)}</system-out>
    </testcase>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="CI Workflows" external="true" tests="${jobEntries.length}" failures="${failures}" errors="0" time="${totalTime}">
  <testsuite name="${escapeXml(workflow.slug)}" package="CI Workflows" external="true" file=".github/workflows/${escapeXml(workflow.file)}" tests="${jobEntries.length}" failures="${failures}" errors="0" time="${totalTime}">
${cases}
  </testsuite>
</testsuites>
`
}

export async function collectWorkflowJUnit({
  root = repositoryRoot,
  reportDir = resolve(root, 'junit-reports'),
  repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
  token = process.env.GITHUB_TOKEN,
  fetcher = fetch,
} = {}) {
  mkdirSync(reportDir, { recursive: true })
  for (const file of readdirSync(reportDir)) {
    if (file.startsWith('workflow-') && file.endsWith('.xml')) {
      rmSync(join(reportDir, file))
    }
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  async function getJson(path) {
    const response = await fetcher(`https://api.github.com/repos/${repository}/${path}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`GitHub API ${path} returned ${response.status}`)
    return response.json()
  }

  const workflows = discoverWorkflows(root)
  let written = 0

  for (const workflow of workflows) {
    try {
      const [mainData, recentData] = await Promise.all([
        getJson(`actions/workflows/${workflow.file}/runs?branch=main&status=completed&per_page=10`),
        getJson(`actions/workflows/${workflow.file}/runs?status=completed&per_page=30`),
      ])
      const candidates = selectCandidateRuns([
        ...(mainData?.workflow_runs ?? []),
        ...(recentData?.workflow_runs ?? []),
      ])
      if (candidates.length === 0) continue

      const jobsByName = new Map()
      for (const run of candidates.slice(0, 3)) {
        const jobsData = await getJson(`actions/runs/${run.id}/jobs?per_page=100`)
        const jobs = Array.isArray(jobsData?.jobs) ? jobsData.jobs : []
        let sawSkipped = false
        for (const job of jobs) {
          if (!job || typeof job !== 'object') continue
          if (job.conclusion === 'skipped' || job.conclusion === 'cancelled') {
            sawSkipped = true
            continue
          }
          if (
            job.conclusion !== 'success' &&
            job.conclusion !== 'failure' &&
            job.conclusion !== 'timed_out'
          )
            continue
          const key = normalizeJobName(job.name)
          if (!jobsByName.has(key)) {
            jobsByName.set(key, { run, job })
          }
        }
        if (jobsByName.size > 0 && !sawSkipped) break
      }

      if (jobsByName.size === 0) continue
      const entries = Array.from(jobsByName.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, entry]) => entry)

      writeFileSync(
        join(reportDir, `workflow-${workflow.slug}.xml`),
        workflowJobsToJUnit(workflow, entries),
        'utf8',
      )
      written += 1
    } catch (error) {
      process.stderr.write(
        `Skipping workflow report for ${workflow.file}: ${error?.message ?? error}\n`,
      )
    }
  }

  return written
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = await collectWorkflowJUnit({
    reportDir: process.argv[2] ? resolve(process.argv[2]) : undefined,
  })
  process.stdout.write(`Collected JUnit reports for ${count} CI workflow(s)\n`)
}
