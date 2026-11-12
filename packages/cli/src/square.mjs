// `hozo square [project]` (RFC 011 §5): after adoption, check that the
// project is set up as Hozo needs, then check its code.
//
// The setup half reads `package.json` files and nothing else: it loads no
// compiler, so it still reports when the install is what is broken. Every
// check that cannot run says why (RFC 011 §3.6), and the others still print.

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseVersion, satisfies } from './range.mjs'
import { checkAdapter, checkCss, checkMetroState, checkScan } from './square-config.mjs'

// The code half (`./square-code.mjs`) is imported only after the setup half
// has run: it loads the compiler.

export const SCHEMA_VERSION = 1

const help = `Usage: hozo square [project] [options]

After adoption: checks that a project using Hozo is set up as Hozo needs,
then compiles its code for Web and Native as \`hozo dry-fit\` does.
The project is the directory with its package.json (default: the current one).

Options:
  --setup               Run only the setup checks
  --format text|json    Output format (default: text)
  --fail-on <level>     Exit 1 on findings at or above this (default: error):
                        none, warning, error, or new-errors (code errors not
                        in the --compare baseline; setup errors still count)
  --compare <report>    A previous \`hozo square --format json\` or
                        \`hozo dry-fit\` JSON report to compare the code with
  --help                Show this help

Setup checks:
  versions  Every installed @hozo/* package is at one version
  peers     What each @hozo/* package needs beside it (react-native, react,
            Expo's modules, ...) is installed within the range it declares
  adapter   Each bundler config (Vite, Astro, Next.js, Metro, Storybook) uses
            its Hozo adapter; on Vite, hozo() comes before React's plugin
  css       The stylesheet Hozo reads imports Tailwind, and @hozo/ui's theme
            when @hozo/ui is installed
  metro     Metro's saved state is newer than metro.config (else: restart it)
  scan      Every file importing @hozo/* was read by the last candidate scan

Code: the audit \`hozo dry-fit\` runs, against the stylesheet the css check
found. A fatal setup finding (no adapter) skips it, and says so.

On a project with no @hozo/* dependency, use \`hozo dry-fit\` instead.`

const SEVERITY_RANK = { warning: 1, error: 2 }
// For setup findings. `new-errors` is about code; a setup error is never in a
// baseline, so setup counts errors under it.
const FAIL_ON = { none: Number.POSITIVE_INFINITY, warning: 1, error: 2, 'new-errors': 2 }

/** An invocation `square` cannot run; the caller reports it with exit 2. */
class SquareInputError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

function parseArgs(argv) {
  const options = { format: 'text', failOn: 'error', setupOnly: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') return { help: true }
    if (argument === '--setup') options.setupOnly = true
    else if (argument === '--compare') {
      const value = argv[++index]
      if (value === undefined || value.startsWith('-'))
        throw new SquareInputError('--compare takes a JSON report', 'missing-value')
      options.compare = value
    } else if (argument === '--format' || argument === '--fail-on') {
      const value = argv[++index]
      const allowed = argument === '--format' ? ['text', 'json'] : Object.keys(FAIL_ON)
      if (!allowed.includes(value))
        throw new SquareInputError(
          `${argument} takes ${allowed.join(', ')}${value === undefined ? '' : `, got ${value}`}`,
          value === undefined ? 'missing-value' : 'invalid-option',
        )
      options[argument === '--format' ? 'format' : 'failOn'] = value
    } else if (argument.startsWith('-'))
      throw new SquareInputError(
        `Unknown option ${argument}; use --help for usage`,
        'unknown-option',
      )
    else if (options.project !== undefined)
      throw new SquareInputError(`Unexpected argument ${argument}`, 'unexpected-argument')
    else options.project = argument
  }
  if (options.failOn === 'new-errors' && !options.compare)
    throw new SquareInputError('--fail-on new-errors needs --compare <report>', 'missing-compare')
  if (options.setupOnly && options.compare)
    throw new SquareInputError('--compare is about code, which --setup skips', 'invalid-option')
  return options
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/**
 * The copy of `name` that Node would load from `directory`: the nearest
 * `node_modules/<name>` walking up, with its real directory, so a pnpm
 * symlink resolves to the store copy and its own neighbours.
 */
function installed(name, directory) {
  for (let current = directory; ; ) {
    const manifest = path.join(current, 'node_modules', name, 'package.json')
    if (existsSync(manifest)) {
      const real = realpathSync(path.dirname(manifest))
      return { name, directory: real, manifest: readJson(path.join(real, 'package.json')) }
    }
    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

const isHozo = (name) => name.startsWith('@hozo/')
const hozoNames = (manifest) =>
  [
    ...new Set(
      ['dependencies', 'devDependencies', 'optionalDependencies']
        .flatMap((field) => Object.keys(manifest[field] ?? {}))
        .filter(isHozo),
    ),
  ].sort()

/**
 * Every `@hozo/*` copy the project loads: the ones it declares, then the ones
 * those depend on, each resolved from the package that needs it. A nested
 * copy at another version is how two versions end up in one bundle.
 */
function hozoCopies(project, declared) {
  const copies = new Map()
  const missing = []
  const queue = declared.map((name) => [name, project, 'package.json', project])
  while (queue.length) {
    const [name, from, requiredBy, consumer] = queue.shift()
    const copy = installed(name, from)
    if (!copy) {
      if (from === project) missing.push(name)
      continue
    }
    if (copies.has(copy.directory)) continue
    // A workspace link resolves to a source directory whose own
    // `node_modules` holds its devDependencies, which a published install
    // would not have. Its peers are looked up first where the nearest
    // installed package (or the project) that needs it would find them.
    const linked = !copy.directory.split(path.sep).includes('node_modules')
    const peersFrom = linked ? [consumer, copy.directory] : [copy.directory]
    copies.set(copy.directory, { ...copy, requiredBy, peersFrom })
    for (const dependency of Object.keys(copy.manifest.dependencies ?? {}).filter(isHozo))
      queue.push([dependency, copy.directory, name, peersFrom[0]])
  }
  return { copies: [...copies.values()], missing }
}

function checkVersions(project, { copies, missing }) {
  const findings = missing.map((name) => ({
    code: 'not-installed',
    severity: 'error',
    package: name,
    message: `${name} is in package.json but not installed`,
    fix: "Run your package manager's install",
  }))
  const versions = new Map()
  // Only published packages release together; a private workspace package
  // under @hozo/ (an example, a fixture) has its own version.
  for (const copy of copies.filter(({ manifest }) => !manifest.private)) {
    const list = versions.get(copy.manifest.version) ?? []
    list.push(copy)
    versions.set(copy.manifest.version, list)
  }
  if (versions.size > 1) {
    // The highest version is the one to move to: Hozo's packages release
    // together, and an older copy is the one left behind.
    const ordered = [...versions.keys()].sort((a, b) => {
      const [x, y] = [parseVersion(a), parseVersion(b)]
      return x && y ? y[0] - x[0] || y[1] - x[1] || y[2] - x[2] : 0
    })
    const target = ordered[0]
    for (const version of ordered.slice(1))
      for (const copy of versions.get(version))
        findings.push({
          code: 'version-mismatch',
          severity: 'error',
          package: copy.name,
          message: `${copy.name} is ${version}${
            copy.requiredBy === 'package.json' ? '' : ` (required by ${copy.requiredBy})`
          }, while other @hozo/* packages are ${target}; Hozo's packages release together and expect one version`,
          fix: `Install every @hozo/* package at ${target}`,
          path: path.relative(project, copy.directory) || '.',
        })
  }
  const released = [...versions.values()].flat().length
  const summary =
    versions.size === 1
      ? `${[...versions.keys()][0]} (${released} package${released === 1 ? '' : 's'})`
      : undefined
  return { findings, summary }
}

function checkPeers(project, { copies }) {
  const findings = []
  let checked = 0
  for (const copy of copies) {
    const optional = copy.manifest.peerDependenciesMeta ?? {}
    for (const [peer, range] of Object.entries(copy.manifest.peerDependencies ?? {})) {
      if (isHozo(peer)) continue // the versions check covers these
      // A linked copy's own directory answers only for a required peer the
      // consumer reaches through another package (Astro's vite). An optional
      // peer the consumer lacks is absent, not the linked copy's devDependency.
      const directories = optional[peer]?.optional ? copy.peersFrom.slice(0, 1) : copy.peersFrom
      const found = directories.reduce(
        (result, directory) => result ?? installed(peer, directory),
        undefined,
      )
      if (!found) {
        if (!optional[peer]?.optional)
          findings.push({
            code: 'peer-missing',
            severity: 'error',
            package: copy.name,
            message: `${copy.name} needs ${peer} ${range}, which is not installed`,
            fix: `Install ${peer} ${range}`,
          })
        continue
      }
      checked += 1
      const version = found.manifest.version
      const result = satisfies(version, range)
      if (result === undefined)
        findings.push({
          code: 'unreadable-range',
          severity: 'warning',
          package: copy.name,
          message: `Could not compare ${peer} ${version} with ${copy.name}'s range ${range}; not checked`,
        })
      else if (!result)
        findings.push({
          code: 'peer-out-of-range',
          severity: 'error',
          package: copy.name,
          message: `${peer} ${version} is outside ${copy.name}'s range ${range}`,
          fix: `Install ${peer} ${range}`,
          path: path.relative(project, found.directory),
        })
    }
  }
  return { findings, summary: `${checked} installed peer${checked === 1 ? '' : 's'} checked` }
}

const CHECKS = [
  ['versions', 'Every @hozo/* package is at one version', checkVersions],
  ['peers', 'Peer dependencies are installed and in range', checkPeers],
  ['adapter', 'The bundler config uses its Hozo adapter', checkAdapter],
  ['css', 'The stylesheet Hozo reads imports Tailwind and the themes it needs', checkCss],
  ['metro', "Metro's saved state matches its config", checkMetroState],
  ['scan', 'The candidate scan reads every file that imports @hozo/*', checkScan],
]

/** The setup checks; `found.css` is set to the stylesheet the css check found. */
function setup(project, declared, found) {
  const graph = hozoCopies(project, declared)
  // What the project has, declared or brought in by another @hozo/* package.
  graph.names = new Set([...declared, ...graph.copies.map((copy) => copy.name)])
  return CHECKS.map(([id, title, check]) => {
    try {
      const { findings = [], summary, skipped, fatal, css } = check(project, graph)
      if (css) found.css = css
      if (skipped) return { id, title, status: 'skipped', reason: skipped, findings }
      return {
        id,
        title,
        status: findings.length ? 'failed' : 'passed',
        summary,
        findings,
        // A finding that leaves nothing for the code half to compile.
        ...(fatal ? { fatal: true } : {}),
      }
    } catch (error) {
      // A check that throws is reported and skipped; the others still run.
      return {
        id,
        title,
        status: 'skipped',
        reason: `The check could not run: ${error.message}`,
        findings: [],
      }
    }
  })
}

function failurePolicy(checks, failOn, code) {
  const threshold = FAIL_ON[failOn]
  const counted = checks
    .flatMap((check) => check.findings)
    .filter((finding) => SEVERITY_RANK[finding.severity] >= threshold)
  const level = failOn === 'new-errors' ? 'error' : failOn
  const reasons = counted.length
    ? [`${counted.length} setup finding${counted.length === 1 ? '' : 's'} at or above ${level}.`]
    : []
  reasons.push(...(code.reasons ?? []).map((reason) => `Code: ${reason}`))
  return {
    failOn,
    // 2 (could not run) outranks 1 (findings): fix the install first.
    exitCode: Math.max(counted.length ? 1 : 0, code.exitCode ?? 0),
    reasons,
  }
}

const MARK = { passed: 'pass', failed: 'FAIL', skipped: 'skip' }

function setupText(report) {
  const lines = [`hozo square: ${report.project}`, '', 'Setup']
  for (const check of report.setup) {
    const detail = check.status === 'skipped' ? check.reason : check.summary
    lines.push(`  ${MARK[check.status]}  ${check.title}${detail ? `: ${detail}` : ''}`)
    for (const finding of check.findings) {
      lines.push(`        ${finding.severity.padEnd(7)} ${finding.message} [${finding.code}]`)
      if (finding.fix) lines.push(`                Fix: ${finding.fix}`)
    }
  }
  return `${lines.join('\n')}\n`
}

function codeText(report, codeLines) {
  const all = report.setup.flatMap((check) => check.findings)
  const count = (severity) => all.filter((finding) => finding.severity === severity).length
  const audited = report.code.report?.diagnostics.bySeverity ?? {}
  const total = (severity) => count(severity) + (audited[severity] ?? 0)
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const lines = ['', 'Code', ...codeLines, '']
  lines.push(`${plural(total('error'), 'error')}, ${plural(total('warning'), 'warning')}.`)
  return `${lines.join('\n')}\n`
}

/**
 * Run `hozo square`. Resolves to `{ exit, error? }`, as `runExplain` does:
 * `error` is `{ message, code }` for the caller to report with exit 2.
 */
export async function runSquare(argv, io, cwd = process.cwd()) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    if (!(error instanceof SquareInputError)) throw error
    return { exit: 2, error }
  }
  if (options.help) {
    io.stdout.write(`${help}\n`)
    return { exit: 0 }
  }
  const project = path.resolve(cwd, options.project ?? '.')
  const fail = (message, code) => ({ exit: 2, error: { message, code } })
  if (!existsSync(project) || !statSync(project).isDirectory())
    return fail(`Project is not a directory: ${project}`, 'project-not-directory')
  const manifestFile = path.join(project, 'package.json')
  if (!existsSync(manifestFile))
    return fail(`No package.json in ${project}`, 'missing-package-json')
  let manifest
  try {
    manifest = readJson(manifestFile)
  } catch (error) {
    return fail(`${manifestFile} is not JSON: ${error.message}`, 'invalid-package-json')
  }
  const declared = hozoNames(manifest)
  if (!declared.length)
    return fail(
      `${manifestFile} has no @hozo/* dependency. To see what Hozo would do with this project before adopting it, run \`hozo dry-fit ${options.project ?? '.'}\``,
      'not-a-hozo-project',
    )

  // The code half's module, and the baseline read before anything runs, so
  // a wrong path fails at once rather than after the audit.
  let codeHalf
  let baseline
  if (!options.setupOnly) codeHalf = await import('./square-code.mjs')
  if (options.compare)
    try {
      baseline = codeHalf.readBaseline(path.resolve(cwd, options.compare))
    } catch (error) {
      if (!(error instanceof codeHalf.BaselineError)) throw error
      return { exit: 2, error }
    }

  const found = {}
  const checks = setup(project, declared, found)
  const report = { schemaVersion: SCHEMA_VERSION, project, setup: checks }
  // The setup half prints before the code half loads the compiler, so a
  // broken install, or an audit that takes a minute, still shows it.
  if (options.format === 'text') io.stdout.write(setupText(report))

  const fatal = checks.find((check) => check.fatal)
  let code
  if (options.setupOnly) code = { status: 'skipped', reason: 'Not run: --setup' }
  else if (fatal)
    code = {
      status: 'skipped',
      reason: `Not run: the ${fatal.id} check leaves nothing to compile [${fatal.findings[0].code}]`,
    }
  else
    try {
      code = await codeHalf.checkCode({
        project,
        name: manifest.name,
        css: found.css,
        failOn: options.failOn,
        baseline,
      })
    } catch (error) {
      if (!(error instanceof codeHalf.BaselineError)) throw error
      return { exit: 2, error }
    }
  const { exitCode, reasons, ...section } = code
  report.code = section
  report.failurePolicy = failurePolicy(checks, options.failOn, code)
  io.stdout.write(
    options.format === 'json'
      ? `${JSON.stringify(report, null, 2)}\n`
      : codeText(report, codeHalf?.codeLines(section) ?? [`  skip  ${section.reason}`]),
  )
  if (report.failurePolicy.exitCode)
    io.stderr.write(`hozo square: ${report.failurePolicy.reasons.join(' ')}\n`)
  return { exit: report.failurePolicy.exitCode }
}
