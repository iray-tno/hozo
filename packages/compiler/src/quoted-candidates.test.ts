import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { openCandidateCache } from './index.ts'

test('quoted arrays feed both Web candidate CSS and the real Native base/state resolver', () => {
  for (const source of [
    'const c = ["p-4","bg-blue-500","hover:opacity-50"]',
    "const c = ['p-4', 'bg-blue-500', 'hover:opacity-50']",
    'const c = [["p-4"],["bg-blue-500","hover:opacity-50"]]',
  ]) {
    const cache = openCandidateCache()
    cache.scanFile('Array.tsx', source, 1)
    const css = cache.renderCss()
    assert.match(css, /\.p-4\b/)
    assert.match(css, /\.bg-blue-500\b/)
    assert.match(css, /\.hover\\:opacity-50:hover/)
    const module = cache.renderNativeModule()
    const executable = module.replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '')
    const resolve = new Function('createClassResolver', `${executable}\nreturn hozoClasses`)(
      createClassResolver,
    )
    const flat = (state: object) =>
      Object.assign({}, ...resolve('p-4 bg-blue-500 hover:opacity-50', state))
    assert.equal(flat({}).paddingTop, 16)
    assert.equal(flat({}).backgroundColor, '#2b7fff')
    assert.equal(flat({}).opacity, undefined)
    assert.equal(flat({ hovered: true }).opacity, 0.5)
  }
})

test('upgrading invalidates missed array candidates even when the source mtime did not change', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-quoted-candidates-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'candidates.json')
  writeFileSync(
    file,
    JSON.stringify({
      version: 3,
      files: { 'Array.tsx': { modified_ms: 1, class_names: [], uses_tailwind: false } },
    }),
  )
  const cache = openCandidateCache(file)
  assert.equal(cache.isCurrent('Array.tsx', 1), false)
  cache.scanFile('Array.tsx', 'const c = ["p-4","hover:opacity-50"]', 1)
  assert.match(cache.renderCss(), /\.p-4\b/)
  cache.persist()
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).version, 5)
  const reopened = openCandidateCache(file)
  assert.equal(reopened.isCurrent('Array.tsx', 1), true)
  assert.equal(
    reopened.renderCss(),
    cache.renderCss(),
    'the corrected result survives a warm start',
  )
})
