import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const compilerRoot = path.join(root, 'packages', 'compiler')

const corpora = {
  'bluesky-social-app': {
    name: 'Bluesky social-app',
    repository: 'https://github.com/bluesky-social/social-app',
    commit: '007c893de107c2ecbf2188d618196075f19c8f5a',
    source: 'src',
    checkout: 'social-app',
  },
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options })
}

function git(checkout, args) {
  return execFileSync('git', ['-C', checkout, ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
}

function acquire(spec) {
  const checkout = path.join(root, 'temp', spec.checkout)
  const gitDirectory = path.join(checkout, '.git')
  if (!existsSync(gitDirectory)) {
    if (existsSync(checkout)) {
      throw new Error(`${checkout} exists but is not a Git checkout; move it aside and retry`)
    }
    mkdirSync(path.dirname(checkout), { recursive: true })
    run('git', ['init', '--quiet', checkout])
    run('git', ['-C', checkout, 'remote', 'add', 'origin', spec.repository])
    run('git', ['-C', checkout, 'fetch', '--depth', '1', 'origin', spec.commit])
    run('git', ['-C', checkout, 'checkout', '--detach', 'FETCH_HEAD'])
  }

  const actual = git(checkout, ['rev-parse', 'HEAD'])
  if (actual !== spec.commit) {
    throw new Error(
      `${checkout} is at ${actual}, expected ${spec.commit}; the runner will not overwrite an existing checkout`,
    )
  }
  return checkout
}

const key = process.argv[2]
const spec = corpora[key]
if (!spec) {
  console.error(`Choose a corpus: ${Object.keys(corpora).join(', ')}`)
  process.exit(1)
}

const checkout = acquire(spec)
run(process.execPath, [path.join(compilerRoot, 'scripts', 'build-native.mjs')], {
  cwd: compilerRoot,
})
run(
  process.execPath,
  [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', compilerRoot],
  { cwd: compilerRoot },
)

const artifact = path.join(root, 'artifacts', 'measurements', `${key}.md`)
run(process.execPath, [
  path.join(root, 'packages', 'migration-audit', 'src', 'cli.mjs'),
  '--root',
  checkout,
  '--source',
  spec.source,
  '--name',
  spec.name,
  '--repository',
  spec.repository,
  '--expected-commit',
  spec.commit,
  '--reproduce-command',
  `pnpm measure:${key === 'bluesky-social-app' ? 'bluesky' : key}`,
  '--output',
  artifact,
])

const baseline = path.join(root, 'docs', 'measurements', `${key}.md`)
if (existsSync(baseline) && readFileSync(artifact, 'utf8') === readFileSync(baseline, 'utf8')) {
  console.log(`Measurement matches the committed baseline: ${path.relative(root, baseline)}`)
} else if (existsSync(baseline)) {
  console.warn(`Measurement differs from the committed baseline: ${path.relative(root, artifact)}`)
} else {
  console.log(`No committed baseline yet: ${path.relative(root, artifact)}`)
}
