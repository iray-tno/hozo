import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeThemeFailures } from './theme-evidence.mjs'

const module = (content) => `__d(function() { ${content} }, 1, []);\n`
const valid = 'const styles = { paddingTop: 19.2, color: "#3581f6" };'
const marker = 'const placeholder = "you@example.com";'

test('unconsumed candidate metadata cannot fail a correctly themed App in either module order', () => {
  const app = module(`${valid}${marker}`)
  const candidates = module(
    'const styles = { "border-box": { borderColor: "hozo-unresolved:box" } };',
  )
  assert.deepEqual(nativeThemeFailures(app + candidates), [])
  assert.deepEqual(nativeThemeFailures(candidates + app), [])
})

test('the complete App module is checked even when its styles are far from its placeholder', () => {
  assert.deepEqual(nativeThemeFailures(module(valid + ' '.repeat(20_000) + marker)), [])
})

test('correct tokens in another module cannot conceal missing or unresolved App styles', () => {
  assert.deepEqual(nativeThemeFailures(module(valid) + module(marker)), [
    'the project spacing scale reached the styles',
    'the project colour resolved',
  ])
  assert.deepEqual(
    nativeThemeFailures(module(`${valid}${marker} const bad = "hozo-unresolved:brand";`)),
    ['no colour was left unresolved'],
  )
  assert.throws(() => nativeThemeFailures(module(valid)), /App is not in/)
  assert.throws(() => nativeThemeFailures(valid + marker), /module boundary/)
})
