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
