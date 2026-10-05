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
