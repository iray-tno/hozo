import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const checkout = path.join(root, 'temp', 'social-app')
const expectedCommit = '007c893de107c2ecbf2188d618196075f19c8f5a'
const repository = 'https://github.com/bluesky-social/social-app'
const artifact = path.join(root, 'artifacts', 'measurements', 'bluesky-rnw-free-build.md')
const baseline = path.join(root, 'docs', 'measurements', 'bluesky-rnw-free-build.md')
const loader = path.join(root, 'scripts', 'measurement', 'hozo-rnw-boundary-loader.cjs')
const importAuditDirectory = path.join(checkout, '.hozo-rnw-import-audit')
const compilerRequire = createRequire(path.join(root, 'packages', 'compiler', 'package.json'))

if (process.versions.node.split('.')[0] !== '24') {
  throw new Error(
    `Bluesky pins Node 24.19.0; this measurement is running ${process.version}. ` +
      'Run it through `mise exec node@24.19.0 -- pnpm measure:bluesky:rnw-free`.',
  )
}

function run(command, args, cwd = root) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  })
}

function output(command, args, cwd = root) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
  }).trim()
}

function acquire() {
  if (!existsSync(path.join(checkout, '.git'))) {
    if (existsSync(checkout)) throw new Error(`${checkout} exists but is not a Git checkout`)
    mkdirSync(path.dirname(checkout), { recursive: true })
    run('git', ['init', '--quiet', checkout])
    run('git', ['-C', checkout, 'remote', 'add', 'origin', repository])
    run('git', ['-C', checkout, 'fetch', '--depth', '1', 'origin', expectedCommit])
    run('git', ['-C', checkout, 'checkout', '--detach', 'FETCH_HEAD'])
  }
  const actual = output('git', ['-C', checkout, 'rev-parse', 'HEAD'])
  if (actual !== expectedCommit)
    throw new Error(`Bluesky checkout is ${actual}; expected ${expectedCommit}`)
}

const pnpmCli = path.join(
  path.dirname(process.execPath),
  'node_modules',
  'corepack',
  'dist',
  'pnpm.js',
)

function pnpm(args, cwd = root) {
  // Corepack selects the version pinned by each checkout's packageManager field.
  run(process.execPath, [pnpmCli, ...args], cwd)
}

function pnpmOutput(args, cwd = root) {
  return output(process.execPath, [pnpmCli, ...args], cwd)
}

function prepare() {
  pnpm(['install', '--frozen-lockfile'], checkout)
  // Bluesky's package script spells an empty argument as `''`. cmd.exe passes
  // those quotes literally, producing imports such as `./app''`. An argv call
  // is portable and generates the same source as the POSIX script.
  pnpm(['exec', 'lex', 'build', '--clear', '--index-file', '--import-ext='], checkout)
  pnpm(['--filter', '@hozo/compiler', 'build:native'])
  pnpm(['--filter', '@hozo/compiler', 'build'])
  pnpm(['--filter', '@hozo/behaviors', 'build'])
  pnpm(['--filter', '@hozo/runtime', 'build'])
}

function flattenModules(modules, into = []) {
  for (const module of modules ?? []) {
    into.push(module)
    flattenModules(module.modules, into)
  }
  return into
}

function normalized(value) {
  return String(value ?? '').replaceAll('\\', '/')
}

function relativeToCheckout(value) {
  const absolute = normalized(checkout)
  const candidate = normalized(value)
  const index = candidate.toLowerCase().indexOf(absolute.toLowerCase())
  return index < 0 ? candidate : candidate.slice(index + absolute.length + 1)
}

function ownerOf(value) {
  const name = relativeToCheckout(value).replace(/^\.\//, '')
  if (name.startsWith('src/') || name === 'index.web.ts') return 'application'
  const marker = '/node_modules/'
  const at = `/${name}`.lastIndexOf(marker)
  if (at < 0) return 'toolchain-or-unknown'
  const rest = `/${name}`.slice(at + marker.length)
  const parts = rest.split('/')
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

function recordReactNativeRequests(into) {
  return {
    apply(compiler) {
      compiler.hooks.normalModuleFactory.tap('HozoRnwBoundaryMeasurement', (factory) => {
        factory.hooks.beforeResolve.tap('HozoRnwBoundaryMeasurement', (request) => {
          if (!/^react-native(?:-web)?(?:\/|$)/.test(request.request)) return
          into.push({ request: request.request, issuer: request.contextInfo.issuer })
        })
      })
    },
  }
}

async function webpackConfig({ blockRnw = false, hozo = false }) {
  const requireFromApp = createRequire(path.join(checkout, 'package.json'))
  const webpack = requireFromApp('webpack')
  const boundaryRequests = []
  const factory = requireFromApp('./webpack.config.js')
  const config = await factory(
    { projectRoot: checkout, mode: 'production', platform: 'web' },
    { mode: 'production' },
  )
  config.cache = false
  config.bail = false
  config.devtool = false
  config.output.path = path.join(
    checkout,
    blockRnw ? 'web-build-hozo-rnw-blocked' : hozo ? 'web-build-hozo' : 'web-build-rnw-baseline',
  )
  config.plugins.push(recordReactNativeRequests(boundaryRequests))

  if (hozo) {
    config.module.rules.unshift({
      enforce: 'pre',
      test: /\.tsx?$/,
      include: path.join(checkout, 'src'),
      use: {
        loader,
        options: {
          projectRoot: checkout,
          compilerEntry: path.join(root, 'packages', 'compiler', 'dist', 'index.js'),
          lowerEntry: path.join(root, 'packages', 'compiler', 'dist', 'lower.js'),
          babelCore: compilerRequire.resolve('@babel/core'),
          auditDirectory: importAuditDirectory,
        },
      },
    })
    config.resolve.alias['@hozo/runtime$'] = path.join(
      root,
      'packages',
      'runtime',
      'dist',
      'index.js',
    )
    config.resolve.alias['@hozo/behaviors$'] = path.join(
      root,
      'packages',
      'behaviors',
      'dist',
      'index.js',
    )
  }

  if (blockRnw) {
    // An absent absolute target is deliberate: unlike aliasing to `false`,
    // webpack cannot turn this into an ignored empty module. Block both
    // names because Bluesky's Babel preset rewrites app-owned `react-native`
    // imports to `react-native-web` before webpack resolves them, while
    // already-compiled dependencies still request `react-native` directly.
    const blocked = path.join(checkout, '.hozo-rnw-must-not-resolve.js')
    config.resolve.alias['react-native$'] = blocked
    config.resolve.alias['react-native-web'] = blocked
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^react-native(?:-web)?(?:\/|$)/, (resource) => {
        resource.request = blocked
      }),
    )
    // Expo's pretty-error plugin attempts to load source maps for every
    // intentionally missing module and floods this measurement with stacks.
    config.plugins = config.plugins.filter(
      (plugin) => plugin.constructor.name !== 'ExpectedErrorsPlugin',
    )
  }
  return { boundaryRequests, config, requireFromApp }
}

async function build(options) {
  const { boundaryRequests, config, requireFromApp } = await webpackConfig(options)
  const webpack = requireFromApp('webpack')
  const previousCwd = process.cwd()
  process.chdir(checkout)
  try {
    const stats = await new Promise((resolve, reject) => {
      webpack(config, (error, stats) => {
        if (error) reject(error)
        else
          resolve(
            stats.toJson({
              all: false,
              errors: true,
              warnings: true,
              modules: true,
              timings: true,
            }),
          )
      })
    })
    return { boundaryRequests, stats }
  } finally {
    process.chdir(previousCwd)
  }
}

function requestImporters(requests) {
  const rows = new Map()
  for (const request of requests) {
    if (!request.issuer) continue
    const owner = ownerOf(request.issuer)
    const importer = relativeToCheckout(request.issuer)
    rows.set(`${owner}\0${importer}`, { owner, importer })
  }
  return [...rows.values()].sort(
    (a, b) => a.owner.localeCompare(b.owner) || a.importer.localeCompare(b.importer),
  )
}

function rnwDiagnostics(stats) {
  return [...(stats.errors ?? []), ...(stats.warnings ?? [])].filter((diagnostic) =>
    /react-native|hozo-rnw-must-not-resolve/.test(
      [
        diagnostic.moduleName,
        diagnostic.moduleIdentifier,
        diagnostic.message,
        diagnostic.details,
      ].join('\n'),
    ),
  )
}

function markdownTable(rows, first = 'Owner', second = 'Importing modules') {
  if (rows.length === 0) return `| ${first} | ${second} |\n|---|---:|\n| None | 0 |`
  return [
    `| ${first} | ${second} |`,
    '|---|---:|',
    ...rows.map(([owner, count]) => `| ${owner} | ${count} |`),
  ].join('\n')
}

function appApiRows(importers) {
  const reached = new Set(
    importers
      .filter(({ owner }) => owner === 'application')
      .map(({ importer }) => importer.replace(/^\.\//, '')),
  )
  const filesByApi = new Map()
  for (const name of readdirSync(importAuditDirectory, { withFileTypes: true })) {
    if (!name.isFile() || !name.name.endsWith('.json')) continue
    const record = JSON.parse(readFileSync(path.join(importAuditDirectory, name.name), 'utf8'))
    if (!reached.has(record.file)) continue
    for (const { imported } of record.imports) {
      const files = filesByApi.get(imported) ?? new Set()
      files.add(record.file)
      filesByApi.set(imported, files)
    }
  }
  return [...filesByApi.entries()]
    .map(([api, files]) => [api, files.size])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function renderReport(baselineStats, hozoStats, blockedStats, boundaryRequests) {
  const baselineModules = flattenModules(baselineStats.modules)
  const rnwModules = baselineModules.filter((module) =>
    /[/\\]react-native-web[/\\]/.test(module.identifier ?? module.name ?? ''),
  )
  const hozoRnwModules = flattenModules(hozoStats.modules).filter((module) =>
    /[/\\]react-native-web[/\\]/.test(module.identifier ?? module.name ?? ''),
  )
  const blockedRnwModules = flattenModules(blockedStats.modules).filter((module) =>
    /[/\\]react-native-web[/\\]/.test(module.identifier ?? module.name ?? ''),
  )
  const boundaryDiagnostics = rnwDiagnostics(blockedStats)
  const boundaryErrors = rnwDiagnostics({ errors: blockedStats.errors }).length
  const boundaryWarnings = rnwDiagnostics({ warnings: blockedStats.warnings }).length
  const importers = requestImporters(boundaryRequests)
  const owners = new Map()
  for (const { owner } of importers) owners.set(owner, (owners.get(owner) ?? 0) + 1)
  const ownerRows = [...owners.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const thirdParty = ownerRows.filter(
    ([owner]) => owner !== 'application' && owner !== 'toolchain-or-unknown',
  )
  const appApis = appApiRows(importers)
  const sample = importers
    .slice(0, 30)
    .map(({ owner, importer }) => `- \`${owner}\`: \`${importer}\``)
    .join('\n')
  return `# RNW-free production-build measurement: Bluesky social-app

This is a dependency-boundary measurement, not a claim that the application runs correctly after React Native Web is removed.

## Corpus and toolchain

| | |
|---|---|
| Repository | ${repository} |
| Commit | \`${expectedCommit}\` |
| Node | \`${process.version}\` |
| Package manager | \`${pnpmOutput(['--version'], checkout)}\` |
| Baseline mode | Expo Webpack production build |
| Hozo experiment | app-owned \`.ts\`/\`.tsx\` passes through the measurement loader (with Web lowering and \`rnwFree: true\` for TSX); \`react-native\` and \`react-native-web\` resolution then point to an absent module |

## Result

1. **The unmodified production graph builds:** ${baselineStats.errors?.length ?? 0} errors.
2. **The graph is not RNW-free:** the successful baseline contains ${rnwModules.length} bundled React Native Web modules (${rnwModules.reduce((sum, module) => sum + (module.size ?? 0), 0)} unminified module bytes reported by Webpack).
3. **Hozo lowering still leaves a real dependency boundary:** its successful production graph contains ${hozoRnwModules.length} RNW modules and makes ${boundaryRequests.length} RN/RNW requests from ${importers.length} unique importing modules.
4. **Both app APIs and dependencies remain:** ${owners.get('application') ?? 0} app modules and ${thirdParty.reduce((sum, [, count]) => sum + count, 0)} modules owned by ${thirdParty.length} third-party packages make those requests.
5. **The block is effective:** repeating that build with RN/RNW unavailable produces ${boundaryDiagnostics.length} resolution diagnostics (${boundaryErrors} errors and ${boundaryWarnings} warnings), and the failed graph contains ${blockedRnwModules.length} resolved React Native Web modules.

This confirms that today's \`rnwFree\` compiler option means “no direct React Native JSX remains.” It does not mean “the complete application dependency graph builds without React Native Web.” Keep the name for now, but do not make the broader release claim until these boundaries are closed.

## Blocked importers by owner

${markdownTable(ownerRows)}

## Remaining app-owned React Native APIs

These counts are referenced identifiers remaining after Hozo lowering, restricted to modules that also reached the blocked production graph. Import declarations, type-only references, and JSX-only bindings removed by lowering are excluded.

${markdownTable(appApis, 'API', 'Reachable app modules')}

## Third-party packages in the blocked graph

${markdownTable(thirdParty)}

## Importer sample

${sample || '- None'}

## Interpretation and next work

- Prioritize the commonly reachable app-owned non-JSX APIs before compatibility aliases or adapters.
- Classify third-party packages as Web-dead/platform-gated, configurable, adapter candidates, or unavoidable RNW dependencies.
- Repeat the build after each adapter batch; source counts alone do not close this boundary.
- Inspect the successful final bundle for RNW modules before making a user-facing RNW-free claim.
- Runtime correctness, CSS fidelity, and browser interaction remain separate verification steps after the dependency graph builds.

## Reproduce

From a Hozo checkout with mise available:

\`mise exec node@24.19.0 -- pnpm measure:bluesky:rnw-free\`
`
}

acquire()
prepare()
console.log('Building the unmodified production dependency graph...')
const { stats: baselineStats } = await build({})
if ((baselineStats.errors?.length ?? 0) > 0) {
  throw new Error(
    `Baseline build has ${baselineStats.errors.length} errors; RNW-free result would be invalid:\n` +
      baselineStats.errors.map((error) => error.message).join('\n\n'),
  )
}
rmSync(importAuditDirectory, { recursive: true, force: true })
mkdirSync(importAuditDirectory, { recursive: true })
console.log('Building the Hozo-lowered production dependency graph with RNW available...')
const { boundaryRequests, stats: hozoStats } = await build({ hozo: true })
if ((hozoStats.errors?.length ?? 0) > 0) {
  throw new Error(
    `Hozo-lowered build has ${hozoStats.errors.length} errors before RNW is blocked:\n` +
      hozoStats.errors.map((error) => error.message).join('\n\n'),
  )
}
console.log('Building after Hozo lowering with react-native resolution blocked...')
const { stats: blockedStats } = await build({ blockRnw: true, hozo: true })
const report = renderReport(baselineStats, hozoStats, blockedStats, boundaryRequests)
mkdirSync(path.dirname(artifact), { recursive: true })
writeFileSync(artifact, report)
if (existsSync(baseline) && readFileSync(baseline, 'utf8') === report) {
  console.log(`Measurement matches ${path.relative(root, baseline)}`)
} else {
  console.log(`Measurement written to ${path.relative(root, artifact)}`)
}
