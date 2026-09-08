import { spawnSync } from 'node:child_process'
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeJUnit } from './normalize-junit.mjs'

mkdirSync('junit-reports', { recursive: true })

const packages = [
  { name: 'compiler', dir: 'packages/compiler', testPattern: 'src/*.test.ts' },
  {
    name: 'behaviors',
    dir: 'packages/behaviors',
    prep: ['pnpm', 'exec', 'tsc', '-p', 'tsconfig.test.json'],
    testPattern: '.test-build/*.test.js',
  },
  {
    name: 'canvas',
    dir: 'packages/canvas',
    prep: ['pnpm', 'exec', 'tsc', '-p', 'tsconfig.test.json'],
    testPattern: '.test-build/*.test.js',
  },
  {
    name: 'core',
    dir: 'packages/core',
    prep: ['pnpm', 'exec', 'tsc', '-p', 'tsconfig.test.json'],
    testPattern: '.test-build/*.test.js',
  },
  { name: 'metro', dir: 'packages/metro', testPattern: 'src/*.test.ts' },
  { name: 'next', dir: 'packages/next', testPattern: 'src/*.test.ts' },
  { name: 'runtime', dir: 'packages/runtime', testPattern: 'src/*.test.ts' },
  {
    name: 'semantics',
    dir: 'packages/semantics',
    prep: ['pnpm', 'exec', 'tsc', '-p', 'tsconfig.test.json'],
    testPattern: '.test-build/*.test.js',
  },
  { name: 'storybook', dir: 'packages/storybook', testPattern: 'src/*.test.ts' },
  { name: 'tailwind', dir: 'packages/tailwind', testPattern: 'src/*.test.ts' },
  {
    name: 'tailwind-conformance',
    dir: 'packages/tailwind-conformance',
    testPattern: 'src/*.test.ts',
    extraArgs: ['--test-concurrency=1'],
  },
  {
    name: 'typography',
    dir: 'packages/typography',
    prep: ['pnpm', 'exec', 'tsc', '-p', 'tsconfig.test.json'],
    testPattern: '.test-build/*.test.js',
  },
  { name: 'vite', dir: 'packages/vite', testPattern: 'src/*.test.ts' },
]

const failedPackages = new Set()

for (const pkg of packages) {
  process.stdout.write(`Running tests for ${pkg.name}...\n`)

  if (pkg.prep) {
    const prepRes = spawnSync(pkg.prep[0], pkg.prep.slice(1), {
      cwd: pkg.dir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (prepRes.status !== 0) {
      process.stderr.write(`Prep failed for ${pkg.name}\n`)
      failedPackages.add(pkg.name)
    }
  }

  const testFiles = globSync(pkg.testPattern, { cwd: pkg.dir }).map((f) => f.replaceAll('\\', '/'))
  if (testFiles.length === 0) {
    process.stderr.write(`No test files found for ${pkg.name} matching ${pkg.testPattern}\n`)
    failedPackages.add(pkg.name)
    continue
  }

  const destFile = join(process.cwd(), 'junit-reports', `node-${pkg.name}.xml`)
  const nodeArgs = [
    '--test',
    '--test-reporter=junit',
    `--test-reporter-destination=${destFile}`,
    ...(pkg.extraArgs ?? []),
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

process.stdout.write(`\nAll tests completed. Total packages failed: ${totalFailed}\n`)
if (totalFailed > 0) {
  process.exitCode = 1
}
