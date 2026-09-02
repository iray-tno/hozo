import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeJUnit } from './normalize-junit.mjs'

mkdirSync('junit-reports', { recursive: true })

const packages = [
  { name: 'compiler', dir: 'packages/compiler', testPattern: 'src/*.test.ts' },
  { name: 'a11y', dir: 'packages/a11y', testPattern: 'src/*.test.ts' },
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
  { name: 'storybook', dir: 'packages/storybook', testPattern: 'src/*.test.ts' },
  { name: 'tailwind', dir: 'packages/tailwind', testPattern: 'src/*.test.ts' },
  {
    name: 'tailwind-conformance',
    dir: 'packages/tailwind-conformance',
    testPattern: 'src/*.test.ts',
    extraArgs: ['--test-concurrency=1'],
  },
  { name: 'vite', dir: 'packages/vite', testPattern: 'src/*.test.ts' },
]

let totalFailed = 0

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
    }
  }

  const destFile = join(process.cwd(), 'junit-reports', `node-${pkg.name}.xml`)
  const nodeArgs = [
    '--test',
    '--test-reporter=junit',
    `--test-reporter-destination=${destFile}`,
    ...(pkg.extraArgs ?? []),
    pkg.testPattern,
  ]

  const result = spawnSync('node', nodeArgs, {
    cwd: pkg.dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    totalFailed++
  }

  try {
    const raw = readFileSync(destFile, 'utf8')
    writeFileSync(destFile, normalizeJUnit(raw, 'typescript'), 'utf8')
  } catch (err) {
    process.stderr.write(`Failed to normalize ${destFile}: ${err.message}\n`)
  }
}

process.stdout.write(`\nAll tests completed. Total packages failed: ${totalFailed}\n`)
if (totalFailed > 0) {
  process.exitCode = 1
}
