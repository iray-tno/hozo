import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

export function extractTurboTasks(summary, readLog = () => '') {
  const tasks = Array.isArray(summary?.tasks) ? summary.tasks : []
  const targetTasks = tasks.filter(
    (task) =>
      task &&
      typeof task === 'object' &&
      task.execution &&
      (task.task !== 'build' || task.execution.exitCode !== 0),
  )
  const selected = targetTasks.length > 0 ? targetTasks : tasks.filter((task) => task?.execution)
  return selected.map((task) => {
    const start = Number(task.execution?.startTime ?? 0)
    const end = Number(task.execution?.endTime ?? start)
    const seconds = Math.max(0, (end - start) / 1000).toFixed(3)
    const exitCode = task.execution?.exitCode ?? 0
    const directory = String(task.directory ?? '').replaceAll('\\', '/')
    const log = task.logFile ? readLog(task.logFile) : ''
    return {
      name: `${task.package ?? 'workspace'} (${task.task ?? 'run'})`,
      classname: `${task.package ?? 'workspace'}`.replace(/^@/, '').replaceAll('/', '::'),
      file: directory ? `${directory}/package.json` : undefined,
      seconds,
      failed: exitCode !== 0,
      failureMessage:
        exitCode !== 0 ? `${task.package}#${task.task} exited ${exitCode}` : undefined,
      log: log.slice(-250_000),
    }
  })
}

export function buildCommandJUnit({
  suiteName,
  command,
  args = [],
  status = 0,
  signal = null,
  error = null,
  seconds = '0.000',
  log = '',
  turboTasks = [],
}) {
  const slug = suiteName.replaceAll(/[^a-zA-Z0-9_.-]/g, '-')
  const fullCommand = [command, ...args].filter(Boolean).join(' ')

  if (turboTasks.length > 0) {
    const failures = turboTasks.filter((task) => task.failed).length
    const casesXml = turboTasks
      .map((task) => {
        const fileAttr = task.file ? ` file="${escapeXml(task.file)}"` : ''
        const failureXml = task.failed
          ? `\n      <failure message="${escapeXml(task.failureMessage ?? 'task failed')}" type="command" />`
          : ''
        return `    <testcase name="${escapeXml(task.name)}" classname="${escapeXml(slug)}::${escapeXml(task.classname)}" time="${escapeXml(task.seconds)}"${fileAttr}>${failureXml}
      <system-out>${escapeXml(task.log || log.slice(-250_000))}</system-out>
    </testcase>`
      })
      .join('\n')

    const extraFailure =
      status !== 0 && failures === 0
        ? `\n    <testcase name="${escapeXml(fullCommand)}" classname="slow.${escapeXml(slug)}" time="${escapeXml(seconds)}">
      <failure message="${escapeXml(
        error?.message ?? (signal ? `terminated by ${signal}` : `command exited ${status}`),
      )}" type="command" />
      <system-out>${escapeXml(log.slice(-250_000))}</system-out>
    </testcase>`
        : ''
    const totalTests = turboTasks.length + (extraFailure ? 1 : 0)
    const totalFailures = failures + (extraFailure ? 1 : 0)

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Integration &amp; Conformance" tests="${totalTests}" failures="${totalFailures}" errors="0" time="${escapeXml(seconds)}">
  <testsuite name="${escapeXml(suiteName)}" package="Integration &amp; Conformance" tests="${totalTests}" failures="${totalFailures}" errors="0" time="${escapeXml(seconds)}">
${casesXml}${extraFailure}
  </testsuite>
</testsuites>
`
  }

  const failure =
    status === 0
      ? ''
      : `
      <failure message="${escapeXml(
        error?.message ?? (signal ? `terminated by ${signal}` : `command exited ${status}`),
      )}" type="command" />`

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Integration &amp; Conformance" tests="1" failures="${status === 0 ? 0 : 1}" errors="0" time="${escapeXml(seconds)}">
  <testsuite name="${escapeXml(suiteName)}" package="Integration &amp; Conformance" tests="1" failures="${status === 0 ? 0 : 1}" errors="0" time="${escapeXml(seconds)}">
    <testcase name="${escapeXml(fullCommand)}" classname="slow.${escapeXml(slug)}" time="${escapeXml(seconds)}">${failure}
      <system-out>${escapeXml(log.slice(-250_000))}</system-out>
    </testcase>
  </testsuite>
</testsuites>
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , suiteName, command, ...args] = process.argv

  if (!suiteName || !command) {
    process.stderr.write('Usage: run-command-junit <suite-name> <command> [...args]\n')
    process.exit(2)
  }

  const turboRunsDir = '.turbo/runs'
  const existingSummaries = new Set(
    existsSync(turboRunsDir)
      ? readdirSync(turboRunsDir).filter((name) => name.endsWith('.json'))
      : [],
  )

  const started = performance.now()
  const child = spawn(command, args, {
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  const output = []
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const text = chunk.toString()
      output.push(text)
      const destination = stream === child.stdout ? process.stdout : process.stderr
      destination.write(text)
    })
  }

  const result = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ status: 1, error }))
    child.once('close', (status, signal) => resolve({ status: status ?? 1, signal }))
  })

  const seconds = ((performance.now() - started) / 1000).toFixed(3)
  const turboTasks = []
  if (existsSync(turboRunsDir)) {
    const newFiles = readdirSync(turboRunsDir).filter(
      (name) => name.endsWith('.json') && !existingSummaries.has(name),
    )
    for (const file of newFiles) {
      const summaryPath = join(turboRunsDir, file)
      try {
        const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
        turboTasks.push(
          ...extractTurboTasks(summary, (logFile) => {
            try {
              return readFileSync(logFile, 'utf8')
            } catch {
              return ''
            }
          }),
        )
      } catch {}
      rmSync(summaryPath, { force: true })
    }
  }

  const log = output.join('').slice(-250_000)
  const slug = suiteName.replaceAll(/[^a-zA-Z0-9_.-]/g, '-')
  const xml = buildCommandJUnit({
    suiteName,
    command,
    args,
    status: result.status,
    signal: result.signal,
    error: result.error,
    seconds,
    log,
    turboTasks,
  })

  mkdirSync('junit-reports', { recursive: true })
  writeFileSync(join('junit-reports', `slow-${slug}.xml`), xml, 'utf8')
  process.exitCode = result.status
}
