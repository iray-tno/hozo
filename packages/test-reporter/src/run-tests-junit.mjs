import { spawnSync } from 'node:child_process'
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { normalizeJUnit } from './normalize-junit.mjs'

mkdirSync('junit-reports', { recursive: true })

/**
 * Every package's tests, read off the package's own `test` script.
 *
 * This was a hand-written list, and it fell six packages behind when the
 * component packages were split out (#423): `@hozo/primitives`,
 * `@hozo/patterns`, `@hozo/rn-compat`, `@hozo/svg`, `@hozo/navigation` and
 * `@hozo/migration-audit` ran in CI and never reached the published report.
 * A package that has a `test` script is a package with tests, so that is the
 * list.
 *
 * Every script has one shape -- optional preparation joined by `&&`, then
 * `node --test [flags] <globs>` -- and it is taken apart rather than run
 * whole, because the reporter needs its own flags on that last command.
 */
function packageFromTestScript(dir, script) {
  const segments = script.split('&&').map((segment) => segment.trim())
  const run = segments.pop().split(/\s+/)
  if (run[0] !== 'node' || run[1] !== '--test') {
    throw new Error(`${dir}: test script does not end in \`node --test\`: ${script}`)
  }
  const rest = run.slice(2)
  return {
    name: dir.slice('packages/'.length),
    dir,
    prep: segments.length > 0 ? segments.join(' && ') : undefined,
    testPatterns: rest.filter((token) => !token.startsWith('--')),
    extraArgs: rest.filter((token) => token.startsWith('--')),
  }
}

const packages = globSync('packages/*/package.json')
  .map((file) => file.replaceAll('\\', '/'))
  .sort()
  .flatMap((file) => {
    const script = JSON.parse(readFileSync(file, 'utf8')).scripts?.test
    return script ? [packageFromTestScript(dirname(file), script)] : []
  })

// The one exception, and why: this package has no `test` script because
// `turbo run test` would run it in CI's test job, which installs without
// it (`--filter '!@hozo/test-reporter'` -- Allure is heavy and only the
// report needs it). Its tests still belong in the report it builds.
packages.push({
  name: 'test-reporter',
  dir: 'packages/test-reporter',
  testPatterns: ['src/*.test.mjs'],
  extraArgs: [],
})

// A preparation step runs through a shell, as `pnpm test` would run it, so
// the binaries it names (`tsc`) have to be on the path the same way: the
// package's own, then the workspace root's, which is where `typescript`
// lives for the packages that do not declare it. Absolute, because the
// step runs inside the package directory -- a relative entry resolved from
// there points at nothing, and only the packages that happened to declare
// `typescript` themselves had found it.
function binPath(dir) {
  return [
    resolve(dir, 'node_modules', '.bin'),
    resolve('node_modules', '.bin'),
    process.env.PATH,
  ].join(delimiter)
}

const failedPackages = new Set()

for (const pkg of packages) {
  process.stdout.write(`Running tests for ${pkg.name}...\n`)

  if (pkg.prep) {
    const prepRes = spawnSync(pkg.prep, {
      cwd: pkg.dir,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, PATH: binPath(pkg.dir) },
    })
    if (prepRes.status !== 0) {
      process.stderr.write(`Prep failed for ${pkg.name}\n`)
      failedPackages.add(pkg.name)
    }
  }

  const testFiles = pkg.testPatterns.flatMap((pattern) =>
    globSync(pattern, { cwd: pkg.dir }).map((f) => f.replaceAll('\\', '/')),
  )
  if (testFiles.length === 0) {
    process.stderr.write(
      `No test files found for ${pkg.name} matching ${pkg.testPatterns.join(' ')}\n`,
    )
    failedPackages.add(pkg.name)
    continue
  }

  const destFile = join(process.cwd(), 'junit-reports', `node-${pkg.name}.xml`)
  const nodeArgs = [
    '--test',
    '--test-reporter=junit',
    `--test-reporter-destination=${destFile}`,
    ...pkg.extraArgs,
    ...testFiles,
  ]

  const result = spawnSync(process.execPath, nodeArgs, {
    cwd: pkg.dir,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    failedPackages.add(pkg.name)
  }

  try {
    const raw = readFileSync(destFile, 'utf8')
    writeFileSync(destFile, normalizeJUnit(raw, 'typescript', pkg.name), 'utf8')
  } catch (err) {
    process.stderr.write(`Failed to normalize ${destFile}: ${err.message}\n`)
  }
}

const totalFailed = failedPackages.size
const failure =
  totalFailed === 0
    ? ''
    : `<failure message="${totalFailed} package test run(s) failed" type="package-tests">${[
        ...failedPackages,
      ].join(', ')}</failure>`
writeFileSync(
  join(process.cwd(), 'junit-reports', 'node-summary.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Node package tests" tests="1" failures="${totalFailed === 0 ? 0 : 1}" errors="0">
  <testsuite name="Node package test runner" tests="1" failures="${totalFailed === 0 ? 0 : 1}" errors="0">
    <testcase name="all configured packages produced passing JUnit" classname="typescript.runner">${failure}</testcase>
  </testsuite>
</testsuites>
`,
  'utf8',
)

process.stdout.write(
  `\nAll tests completed for ${packages.length} packages. Total packages failed: ${totalFailed}\n`,
)
if (totalFailed > 0) {
  process.exitCode = 1
}
