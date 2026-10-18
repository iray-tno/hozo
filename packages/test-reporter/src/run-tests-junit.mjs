import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { normalizeJUnit } from './normalize-junit.mjs'
import { runPackageStages, stageJUnit } from './package-test-plan.mjs'

const reportDir = resolve('junit-reports')
mkdirSync(reportDir, { recursive: true })

// Read each package's complete test pipeline, not a second maintained test
// list. Three has two Node test stages and trailing conformance commands.
const packages = globSync('packages/*/package.json')
  .map((file) => file.replaceAll('\\', '/'))
  .sort()
  .flatMap((file) => {
    const script = JSON.parse(readFileSync(file, 'utf8')).scripts?.test
    return script
      ? [{ name: dirname(file).slice('packages/'.length), dir: dirname(file), script }]
      : []
  })

// No test script: including Allure in ordinary package CI would be expensive.
// The report still measures its own tests, including this runner's fixtures.
packages.push({
  name: 'test-reporter',
  dir: 'packages/test-reporter',
  script: 'node --test --test-concurrency=1 src/*.test.mjs',
})

const failedPackages = []
for (const pkg of packages) {
  process.stdout.write(`Running tests for ${pkg.name}...\n`)
  try {
    if (!runPackageStages({ ...pkg, reportDir, normalize: normalizeJUnit }))
      failedPackages.push(pkg.name)
  } catch (error) {
    failedPackages.push(pkg.name)
    writeFileSync(
      join(reportDir, `node-${pkg.name}-runner.xml`),
      stageJUnit(pkg.name, pkg.script, error.message),
    )
  }
}

writeFileSync(
  join(reportDir, 'node-summary.xml'),
  stageJUnit(
    'Node package test runner',
    'all configured package pipelines produced passing JUnit',
    failedPackages.length ? `Failed packages: ${failedPackages.join(', ')}` : '',
  ),
)
process.stdout.write(
  `\nAll tests completed for ${packages.length} packages. Failed: ${failedPackages.length}\n`,
)
if (failedPackages.length) process.exitCode = 1
