import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { reconcileRuntimeCandidateContributions } from './candidate-reconciliation.ts'
import { openCandidateCache } from './index.ts'

const dynamic = (classes: string) => `export const tone=()=> '${classes}'`
const staticSource = `import {View} from '@hozo/core'; export const A=()=> <View className="p-2"/>`

function contribution(id: string, revision: string, source: string, sources?: readonly string[]) {
  const cache = openCandidateCache(undefined, sources)
  cache.scanFile(id, source, 12)
  return { id, revision, record: cache.exportFile(id)! }
}

test('persistent source policy is validated before accepting unchanged cached entries', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-source-policy-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'candidates.json')
  const source = `import {View} from 'foreign-ui'; export const A=()=> <View className="p-4"/>`
  const trusted = openCandidateCache(file, ['foreign-ui'])
  trusted.scanFile('f.tsx', source, 10)
  assert.deepEqual(trusted.candidates(), [])
  trusted.persist()
  const same = openCandidateCache(file, ['foreign-ui'])
  assert.equal(same.isCurrent('f.tsx', 10), true)
  assert.equal(same.exportFile('f.tsx'), trusted.exportFile('f.tsx'))
  const changed = openCandidateCache(file)
  assert.equal(changed.isCurrent('f.tsx', 10), false)
  assert.equal(changed.exportFile('f.tsx'), null)
  changed.scanFile('f.tsx', source, 10)
  assert.deepEqual(changed.candidates(), ['p-4'])
  changed.persist()
  assert.equal(openCandidateCache(file).isCurrent('f.tsx', 10), true)
  assert.equal(openCandidateCache(file, ['foreign-ui']).isCurrent('f.tsx', 10), false)
})

test('opaque scan exports replay both backends without a second scan and preserve static-only preflight facts', (t) => {
  const cache = openCandidateCache()
  assert.equal(cache.exportFile('missing'), null)
  cache.scanFile('static', staticSource, 1)
  cache.scanFile('dynamic', dynamic('bg-red-500 p-4'), 1)
  const staticRecord = cache.exportFile('static')!
  const dynamicRecord = cache.exportFile('dynamic')!
  const expectedCss = cache.renderCss()
  const expectedNative = cache.renderNativeModule()
  const alternateTheme = { colors: [], spacingPx: 11 }
  const themedCss = cache.renderCss(alternateTheme)
  const themedNative = cache.renderNativeModule(alternateTheme)
  const prototype = Object.getPrototypeOf(cache)
  t.mock.method(prototype, 'scanFile', () => {
    throw new Error('replay must not scan')
  })
  t.mock.method(prototype, 'persist', () => {
    throw new Error('reconciliation must not write a shared disk cache')
  })
  const replay = openCandidateCache()
  assert.equal(replay.importFile('static', staticRecord, 5), true)
  assert.equal(replay.usesTailwind, true)
  assert.deepEqual(replay.candidates(), [])
  assert.equal(replay.importFile('dynamic', dynamicRecord, 5), true)
  assert.equal(replay.renderCss(), expectedCss)
  assert.equal(replay.renderNativeModule(), expectedNative)
  assert.equal(replay.renderCss(alternateTheme), themedCss)
  assert.equal(replay.renderNativeModule(alternateTheme), themedNative)
  assert.equal(replay.isCurrent('static', 5), true)
  assert.equal(
    replay.importFile('static', staticRecord, 8),
    false,
    'mtime-only adoption changes no candidates',
  )
  assert.equal(replay.exportFile('static'), staticRecord, 'mtime is not a semantic worker conflict')
  assert.equal(replay.isCurrent('static', 8), true)
  const reconciled = reconcileRuntimeCandidateContributions(
    [
      { id: 'static', revision: 'a' },
      { id: 'dynamic', revision: 'b' },
    ],
    JSON.parse(
      JSON.stringify([
        { id: 'static', revision: 'a', record: staticRecord },
        { id: 'dynamic', revision: 'b', record: dynamicRecord },
      ]),
    ),
  )
  assert.equal(reconciled.status, 'complete')
  if (reconciled.status === 'complete') assert.equal(reconciled.cache.renderCss(), expectedCss)
})

test('failed or incompatible replay cannot partially modify a valid cache', () => {
  const cache = openCandidateCache()
  cache.scanFile('target', dynamic('p-2'), 1)
  const original = cache.exportFile('target')!
  const value = JSON.parse(original)
  const invalid = [
    '{',
    JSON.stringify({ ...value, schema: 999 }),
    JSON.stringify({ ...value, scanVersion: 999 }),
    JSON.stringify({ ...value, entry: { ...value.entry, usesTailwind: 'yes' } }),
    JSON.stringify({ ...value, entry: { ...value.entry, classNames: [1] } }),
    JSON.stringify({
      schema: 1,
      scanVersion: value.scanVersion,
      entry: value.entry,
      unknown: null,
    }),
  ]
  for (const record of invalid) {
    assert.throws(() => cache.importFile('target', record, 9), /Invalid cached candidate/)
    assert.equal(cache.exportFile('target'), original)
    assert.equal(cache.isCurrent('target', 1), true)
  }
  const foreign = contribution('foreign', 'one', staticSource, ['some-other-package'])
  assert.throws(() => cache.importFile('target', foreign.record, 9), /source policy/)
  assert.equal(cache.exportFile('target'), original)
})

test('final source receipts drop absent contributions, deduplicate workers, and retain shared references', () => {
  const a = contribution('App.tsx', 'hash-a', dynamic('p-4 bg-red-500'))
  const b = contribution('Page.mdx?jsx', 'hash-b', dynamic('p-4 text-blue-500'))
  const deleted = contribution('Deleted.tsx', 'hash-deleted', dynamic('m-99'))
  const expected = [
    { id: b.id, revision: b.revision },
    { id: a.id, revision: a.revision },
  ]
  const result = reconcileRuntimeCandidateContributions(expected, [deleted, b, a, { ...a }])
  assert.equal(result.status, 'complete')
  if (result.status !== 'complete') return
  assert.deepEqual(result.accepted, ['App.tsx', 'Page.mdx?jsx'])
  assert.deepEqual(result.ignored, ['Deleted.tsx'])
  assert.deepEqual(result.cache.candidates(), ['bg-red-500', 'p-4', 'text-blue-500'])
  result.cache.forget(a.id)
  assert.deepEqual(result.cache.candidates(), ['p-4', 'text-blue-500'])
  const reversed = reconcileRuntimeCandidateContributions([...expected].reverse(), [a, b, deleted])
  assert.equal(reversed.status, 'complete')
  if (reversed.status === 'complete') {
    const control = openCandidateCache()
    control.importFile(a.id, a.record, 0)
    control.importFile(b.id, b.record, 0)
    assert.equal(reversed.cache.renderCss(), control.renderCss())
    assert.equal(reversed.cache.renderNativeModule(), control.renderNativeModule())
  }
})

test('missing, stale, conflicting, invalid observations cannot escape as a partial publisher cache', () => {
  const valid = contribution('valid', 'current', staticSource)
  const stale = contribution('stale', 'old', dynamic('p-2'))
  const left = contribution('conflict', 'current', dynamic('p-2'))
  const right = contribution('conflict', 'current', dynamic('p-4'))
  const result = reconcileRuntimeCandidateContributions(
    ['valid', 'missing', 'stale', 'conflict', 'invalid'].map((id) => ({ id, revision: 'current' })),
    [valid, stale, left, right, { id: 'invalid', revision: 'current', record: '{}' }],
  )
  assert.equal(result.status, 'incomplete')
  assert.equal('cache' in result, false)
  if (result.status === 'incomplete') {
    assert.deepEqual(
      result.issues.map(({ id, kind }) => [id, kind]),
      [
        ['conflict', 'conflict'],
        ['invalid', 'invalid'],
        ['missing', 'missing'],
        ['stale', 'stale'],
      ],
    )
    assert.deepEqual(result.accepted, ['valid'])
  }
})

test('authoritative derived IDs and revisions prevent query collisions and stale replay from becoming current', () => {
  const authored = contribution('file.tsx', 'authored', staticSource)
  const a = contribution('file.tsx?a', 'a-current', dynamic('bg-red-500'))
  const oldA = contribution('file.tsx?a', 'a-old', dynamic('bg-blue-500'))
  const b = contribution('file.tsx?b', 'b-current', dynamic('m-4'))
  const result = reconcileRuntimeCandidateContributions([authored, a, b], [authored, oldA, b, a])
  assert.equal(result.status, 'complete')
  if (result.status === 'complete')
    assert.deepEqual(result.cache.candidates(), ['bg-red-500', 'm-4'])
  assert.throws(() => reconcileRuntimeCandidateContributions([a, a], [a]), /unique IDs/)
  assert.throws(
    () => reconcileRuntimeCandidateContributions([{ id: 'a', revision: '' }], []),
    /nonempty revisions/,
  )
  const empty = reconcileRuntimeCandidateContributions([], [authored, a])
  assert.equal(empty.status, 'complete')
  if (empty.status === 'complete') {
    assert.equal(empty.cache.size, 0)
    assert.equal(empty.cache.usesTailwind, false)
  }
})

test('reconciliation honors the actual compiler scan source policy, including same-named foreign components', () => {
  const source = `import {View} from 'foreign-ui'; export const A=()=> <View className="p-4"/>`
  const foreign = contribution('foreign.tsx', 'same-source', source)
  const trusted = contribution('foreign.tsx', 'same-source', source, ['foreign-ui'])
  const defaultResult = reconcileRuntimeCandidateContributions([foreign], [foreign])
  assert.equal(defaultResult.status, 'complete')
  if (defaultResult.status === 'complete')
    assert.deepEqual(defaultResult.cache.candidates(), ['p-4'])
  const trustedResult = reconcileRuntimeCandidateContributions([trusted], [trusted], ['foreign-ui'])
  assert.equal(trustedResult.status, 'complete')
  if (trustedResult.status === 'complete') {
    assert.deepEqual(trustedResult.cache.candidates(), [])
    assert.equal(trustedResult.cache.usesTailwind, true)
  }
  const wrong = reconcileRuntimeCandidateContributions([foreign], [trusted])
  assert.equal(wrong.status, 'incomplete')
})
