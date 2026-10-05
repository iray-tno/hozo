import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const bootstrap = readFileSync(
  new URL('../.github/workflows/bootstrap-publish.yml', import.meta.url),
  'utf8',
)

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
  for (const name of ['publish', 'artifacts-dry-run']) {
    assert.match(jobs.get(name), /needs: \[build, showcase-assets\]/)
    assert.match(jobs.get(name), /pattern: '\{x86_64,aarch64\}-\*'/)
  }
  assert.match(jobs.get('crates'), /needs: publish/)
  assert.match(jobs.get('github-release'), /needs: \[crates, showcase-assets\]/)
  assert.match(jobs.get('github-release'), /contents: write/)
  assert.match(jobs.get('github-release'), /showcase-release.mjs publish/)
  assert.doesNotMatch(release, /continue-on-error|always\(\)/)
})

test('bootstrap is manual, explicit, and uses only bootstrap credentials', () => {
  assert.match(bootstrap, /workflow_dispatch:/)
  assert.doesNotMatch(bootstrap, /\b(?:push|schedule):/)
  assert.match(bootstrap, /target:\s+description: Exact package or crate name/)
  assert.match(bootstrap, /secrets\.NPM_BOOTSTRAP_TOKEN/)
  assert.match(bootstrap, /secrets\.CARGO_BOOTSTRAP_TOKEN/)
  assert.doesNotMatch(bootstrap, /secrets\.(?:NPM_TOKEN|CARGO_REGISTRY_TOKEN)/)
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
