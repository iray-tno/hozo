import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { allowedScopes, checkTitle } from './check-pr-title.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scopes = allowedScopes(root)

test('scopes come from the directories, crates without their prefix', () => {
  for (const scope of [
    'compiler',
    'core',
    'landing',
    'storybook-demo',
    'parser',
    'web',
    'repo',
    'ci',
  ]) {
    assert.ok(scopes.has(scope), `expected scope ${scope}`)
  }
  assert.ok(!scopes.has('hozo_parser'))
})

test('conventional titles pass', () => {
  for (const title of [
    'fix(landing): make CodeShowcase responsive on narrow viewports',
    'feat(ui): add Input, Checkbox and Switch',
    'docs: describe the pull request convention',
    'refactor(compiler,parser)!: move class scanning into the parser',
    'chore(release): version packages',
  ]) {
    assert.deepEqual(checkTitle(title, scopes), [], title)
  }
})

test('house-style and malformed titles are refused with a reason', () => {
  assert.equal(checkTitle('A token can carry its dark value', scopes).length, 1)
  assert.match(checkTitle('feature(ui): add Input', scopes)[0], /unknown type/)
  assert.match(checkTitle('fix(nonexistent): something', scopes)[0], /unknown scope `nonexistent`/)
  assert.match(checkTitle('fix(core): trailing period.', scopes)[0], /period/)
  assert.match(checkTitle(`fix(core): ${'x'.repeat(100)}`, scopes)[0], /characters/)
})
