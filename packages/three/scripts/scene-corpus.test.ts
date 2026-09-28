import assert from 'node:assert/strict'
import test from 'node:test'

import { REVISION } from 'three'

import { runSceneCorpus, SCENE_CORPUS_FIXTURES } from './scene-corpus.ts'

test('the first real-scene corpus is version-pinned, representative, and executable', async () => {
  assert.equal(SCENE_CORPUS_FIXTURES.length, 5)
  assert.equal(new Set(SCENE_CORPUS_FIXTURES.map((fixture) => fixture.id)).size, 5)
  assert.ok(
    SCENE_CORPUS_FIXTURES.every((fixture) => fixture.source.version.includes(`r${REVISION}`)),
  )
  assert.deepEqual(
    SCENE_CORPUS_FIXTURES.map((fixture) => fixture.archetype),
    [
      'flat diagram / labelled interaction',
      'wireframe or CAD-like scene',
      'points / sprite scene',
      'instancing plus morph with a portable material',
      'ordinary glTF/PBR scene',
    ],
  )

  const report = await runSceneCorpus()
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.generatedAgainst, `Three.js r${REVISION}`)
  assert.equal(report.summary.failed, 0)
  assert.equal(report.summary.useful, 4)
  assert.equal(report.summary.diagnostic, 1)
  assert.deepEqual(report.summary.notRunByFamily, {
    'classic-webgl': 5,
    'modern-webgpu': 5,
    'native-host': 5,
  })
  assert.ok(report.fixtures.every((fixture) => fixture.verified))
  assert.deepEqual(report.fixtures.at(-1)?.portableObservation.diagnosticCodes, [
    'UNSUPPORTED_MATERIAL',
  ])
})
