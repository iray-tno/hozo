import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { loadStaticProjectTheme } from './static-project.ts'

test('static discovery distinguishes absent, explicit missing and invalid entries', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-static-theme-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.equal((await loadStaticProjectTheme(root)).css.status, 'absent')
  assert.equal((await loadStaticProjectTheme(root, 'missing.css')).css.status, 'invalid')
  writeFileSync(path.join(root, 'global.css'), '@theme {')
  const broken = await loadStaticProjectTheme(root)
  assert.equal(broken.css.status, 'resolved')
  assert.equal(broken.theme.status, 'invalid')
})

test('entry and transitive module directives are refused, not executed or defaulted', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-static-module-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'config.cjs'), 'throw new Error("must never execute")')
  for (const directive of [
    '@config "./config.cjs";',
    '@plugin "./config.cjs";',
    '@media screen { @plugin "./config.cjs"; }',
  ]) {
    writeFileSync(path.join(root, 'global.css'), directive)
    assert.equal((await loadStaticProjectTheme(root)).theme.status, 'unsupported')
    writeFileSync(path.join(root, 'global.css'), '@import "./tokens.css";')
    writeFileSync(path.join(root, 'tokens.css'), directive)
    const imported = await loadStaticProjectTheme(root)
    assert.equal(imported.theme.status, 'unsupported')
    assert.match(
      imported.theme.status === 'unsupported' ? imported.theme.reason : '',
      /tokens\.css/,
    )
    assert.equal(imported.stylesheets.length, 2)
  }
})

test('comments and strings are not executable directives and imported edits do not reuse stale facts', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-static-refresh-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(
    path.join(root, 'global.css'),
    `/* @plugin 'evil' */
@import "./tokens.css";
.sample { content: "@config 'evil'"; }`,
  )
  const file = path.join(root, 'tokens.css')
  writeFileSync(file, '@theme { --color-brand: #123456; }')
  const first = await loadStaticProjectTheme(root)
  assert.equal(first.theme.status, 'resolved')
  assert.equal(first.theme.status === 'resolved' && first.theme.value.colors[0]?.hex, '#123456')
  writeFileSync(file, '@theme { --color-brand: #654321; }')
  const second = await loadStaticProjectTheme(root)
  assert.equal(second.theme.status === 'resolved' && second.theme.value.colors[0]?.hex, '#654321')
  assert.notDeepEqual(first.stylesheets, second.stylesheets)
  assert.equal(readFileSync(file, 'utf8'), '@theme { --color-brand: #654321; }')
  writeFileSync(file, '@config "./config.cjs";')
  assert.equal((await loadStaticProjectTheme(root)).theme.status, 'unsupported')
})

test('missing imported CSS and remote imports cannot masquerade as resolved project themes', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-static-import-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'global.css'), '@import "./absent.css";')
  assert.equal((await loadStaticProjectTheme(root)).theme.status, 'invalid')
  writeFileSync(path.join(root, 'global.css'), '@import url("https://example.invalid/theme.css");')
  assert.equal((await loadStaticProjectTheme(root)).theme.status, 'unsupported')
})
