import assert from 'node:assert/strict'
import test from 'node:test'
import { openCandidateCache } from './index.ts'
import {
  ownerPackageCandidateContribution,
  withOwnerPackageCandidates,
} from './owner-package-candidates.ts'
import type { OwnerPackageContributions } from './owner-package-contributions.ts'

function complete(candidates: string[]): OwnerPackageContributions {
  return { status: 'complete', fingerprint: 'test', candidates, instances: [], unassessed: [] }
}

test('manifest candidate receipts are portable native facts, including empty captures and source policy', () => {
  for (const names of [[], ['p-4', 'hover:p-2']]) {
    const facts = ownerPackageCandidateContribution(complete(names))
    assert.equal(facts.revision, 'test')
    assert.ok(Object.isFrozen(facts))
    const replay = openCandidateCache()
    replay.importFile(facts.id, JSON.parse(JSON.stringify(facts.record)), 0)
    assert.deepEqual(replay.candidates(), [...names].sort())
    assert.equal(replay.usesTailwind, names.length > 0)
    assert.throws(
      () => openCandidateCache(undefined, ['custom']).importFile(facts.id, facts.record, 0),
      /policy|sources|incompatible/i,
    )
  }
})

test('owner candidate overlay replays authored facts and retains manifest tokens also used statically', () => {
  const cache = openCandidateCache()
  cache.scanFile(
    'static.tsx',
    `import {View} from '@hozo/core';const A=()=> <View className="p-4"/>`,
    1,
  )
  cache.scanFile('dynamic.ts', `export const tone=()=> 'bg-red-500'`, 1)
  const before = cache.renderNativeModule()
  const overlay = withOwnerPackageCandidates(
    { cache, files: ['static.tsx', 'dynamic.ts', 'dynamic.ts'] },
    complete(['p-4', 'p-2', 'p-4']),
  )
  assert.deepEqual(overlay.candidates(), ['bg-red-500', 'p-2', 'p-4'])
  assert.equal(overlay.usesTailwind, true)
  const reference = openCandidateCache()
  reference.scanFile('reference.ts', `export const tones=['p-4','p-2','bg-red-500']`, 1)
  const theme = { colors: [], spacingPx: 7 }
  assert.equal(overlay.renderNativeModule(theme), reference.renderNativeModule(theme))
  assert.equal(overlay.renderCss(theme), reference.renderCss(theme))
  assert.equal(cache.renderNativeModule(), before)
  assert.equal(cache.exportFile('\0hozo-owner-package-candidates.ts'), null)
})

test('candidate consumption does not rescan authored sources, persist or interpret package names', (t) => {
  const cache = openCandidateCache()
  cache.scanFile('a.ts', `const x='m-2'`, 1)
  const prototype = Object.getPrototypeOf(cache)
  const scan = prototype.scanFile
  const calls: string[] = []
  t.mock.method(prototype, 'scanFile', function (id, text, revision) {
    calls.push(id)
    return scan.call(this, id, text, revision)
  })
  t.mock.method(prototype, 'persist', () => {
    throw new Error('no persistent overlay')
  })
  const result = withOwnerPackageCandidates(
    { cache, files: ['a.ts'] },
    complete(['hover:p-4', 'p-2!']),
  )
  assert.deepEqual(calls, ['\0hozo-owner-package-candidates.ts'])
  assert.deepEqual(result.candidates(), ['hover:p-4', 'm-2', 'p-2!'])
})

test('incomplete, missing and incompatible authored facts cannot expose a partial overlay', () => {
  const cache = openCandidateCache()
  assert.throws(
    () =>
      withOwnerPackageCandidates({ cache, files: [] }, { status: 'incomplete', reasons: ['late'] }),
    /complete/,
  )
  assert.throws(
    () => withOwnerPackageCandidates({ cache, files: ['missing'] }, complete(['p-4'])),
    /every authored/,
  )
  cache.scanFile('a.tsx', `import {View} from 'custom';const A=()=> <View className="p-4"/>`, 1)
  assert.throws(
    () => withOwnerPackageCandidates({ cache, files: ['a.tsx'] }, complete(['p-2']), ['custom']),
    /policy|sources|incompatible/i,
  )
  assert.equal(withOwnerPackageCandidates({ cache, files: ['a.tsx'] }, complete([])), cache)
})
