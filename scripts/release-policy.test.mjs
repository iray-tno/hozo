import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const bootstrap = readFileSync(
  new URL('../.github/workflows/bootstrap-publish.yml', import.meta.url),
  'utf8',
)

test('the fresh NDK compiler check cannot hide a failing producer behind tee', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/android-ndk.yml', import.meta.url),
    'utf8',
  )
  const step = (name) => workflow.split(`- name: ${name}`)[1]?.split(/\n {6}-/)[0] ?? ''
  const check = step('Verify a fresh install and execute its compiler')
  assert.match(check, /shell: bash/)
  assert.match(check, /clang" --version \| tee/)
  const guard = step('Check pipeline failure detection')
  assert.match(guard, /shell: bash/)
  assert.match(guard, /if node -e 'process.exit\(17\)' \| tee/)
  assert.match(guard, /exit 1/)
  assert.doesNotMatch(check + guard, /continue-on-error|\|\| true/)
})

test('the normal release contains no long-lived registry secret', () => {
  assert.doesNotMatch(release, /secrets\.(?:NPM_TOKEN|CARGO_REGISTRY_TOKEN)/)
  assert.match(release, /permissions:\s+id-token: write/)
  assert.match(release, /rust-lang\/crates-io-auth-action@v1/)
  assert.match(release, /npm publish "\$tarball"/)
})

test('native showcase evidence and binaries are a pre-publication release gate', () => {
  const jobs = new Map(
    [...release.matchAll(/^ {2}([\w-]+):\r?\n([\s\S]*?)(?=^ {2}[\w-]+:\r?$|$(?![\s\S]))/gm)].map(
      ([, name, body]) => [name, body],
    ),
  )
  assert.match(jobs.get('showcase'), /uses: \.\/\.github\/workflows\/native-showcase.yml/)
  assert.match(jobs.get('showcase'), /release-assets: true/)
  assert.match(jobs.get('showcase'), /release-signing: .*startsWith\(github.ref, 'refs\/tags\/v'\)/)
  assert.match(jobs.get('showcase-assets'), /needs: showcase/)
  assert.match(jobs.get('showcase-assets'), /showcase-release.mjs prepare/)
  assert.match(jobs.get('native-integration'), /pnpm --filter @hozo\/example-native-demo test/)
  assert.match(jobs.get('native-integration'), /pnpm --filter @hozo\/compiler build:native/)
  assert.match(jobs.get('native-integration'), /hozo-native-integration-bundles/)
  assert.doesNotMatch(jobs.get('native-integration'), /continue-on-error|\|\| true/)
  for (const name of ['publish', 'artifacts-dry-run']) {
    assert.match(jobs.get(name), /needs: \[build, showcase-assets, native-integration\]/)
    assert.match(jobs.get(name), /pattern: '\{x86_64,aarch64\}-\*'/)
    assert.doesNotMatch(jobs.get(name), /always\(\)|continue-on-error/)
  }
  assert.match(jobs.get('crates'), /needs: publish/)
  assert.match(jobs.get('github-release'), /needs: \[crates, showcase-assets\]/)
  assert.match(jobs.get('github-release'), /contents: write/)
  assert.match(jobs.get('github-release'), /showcase-release.mjs publish/)
  assert.doesNotMatch(release, /continue-on-error/)
})

test('bootstrap is manual, explicit, and uses only bootstrap credentials', () => {
  assert.match(bootstrap, /workflow_dispatch:/)
  assert.doesNotMatch(bootstrap, /\b(?:push|schedule):/)
  assert.match(bootstrap, /target:\s+description: Exact package or crate name/)
  assert.match(bootstrap, /secrets\.NPM_BOOTSTRAP_TOKEN/)
  assert.match(bootstrap, /secrets\.CARGO_BOOTSTRAP_TOKEN/)
  assert.doesNotMatch(bootstrap, /secrets\.(?:NPM_TOKEN|CARGO_REGISTRY_TOKEN)/)
})

test('manual signing verification never enables registry or release writes', () => {
  const jobs = new Map(
    [...release.matchAll(/^ {2}([\w-]+):\r?\n([\s\S]*?)(?=^ {2}[\w-]+:\r?$|$(?![\s\S]))/gm)].map(
      ([, name, body]) => [name, body],
    ),
  )
  assert.match(release.split('jobs:')[0], /release-signing:[\s\S]*type: boolean\s+default: false/)
  assert.match(
    jobs.get('showcase'),
    /release-signing: \$\{\{ startsWith\(github.ref, 'refs\/tags\/v'\) \|\| inputs.release-signing \}\}/,
  )
  assert.match(
    jobs.get('showcase-assets'),
    /HOZO_RELEASE_SIGNING: \$\{\{ \(startsWith\(github.ref, 'refs\/tags\/v'\) \|\| inputs.release-signing\) && '1' \|\| '' \}\}/,
  )
  for (const name of ['publish', 'crates', 'github-release']) {
    assert.match(jobs.get(name), /^ {4}if: startsWith\(github.ref, 'refs\/tags\/v'\)\r?$/m)
    assert.doesNotMatch(jobs.get(name), /inputs\.release-signing/)
  }
})

test('only npm bootstrap jobs can attest provenance with OIDC', () => {
  const jobs = new Map(
    [...bootstrap.matchAll(/^ {2}([\w-]+):\r?\n([\s\S]*?)(?=^ {2}[\w-]+:\r?$|$(?![\s\S]))/gm)].map(
      ([, name, body]) => [name, body],
    ),
  )
  for (const name of ['npm-workspace', 'npm-native']) {
    const job = jobs.get(name)
    assert.ok(job, `${name} exists`)
    assert.match(job, /permissions:\s+contents: read\s+id-token: write/)
    assert.match(job, /npm publish .*--provenance/)
  }
  for (const name of ['validate', 'crate']) {
    const job = jobs.get(name)
    assert.ok(job, `${name} exists`)
    assert.doesNotMatch(job, /id-token: write/)
  }
  assert.doesNotMatch(bootstrap.split('jobs:')[0], /id-token: write/)
})
