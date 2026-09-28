import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { REVISION } from 'three'

import { MINIMAL_PBR_GLTF_SOURCE, SCENE_CORPUS_SCENES } from '../src/conformance-scenes.ts'
import { runSceneCorpus, SCENE_CORPUS_FIXTURES } from './scene-corpus.ts'

test('the first real-scene corpus is version-pinned, representative, and executable', async () => {
  assert.deepEqual(
    JSON.parse(MINIMAL_PBR_GLTF_SOURCE),
    JSON.parse(await readFile(new URL('../fixtures/minimal-pbr.gltf', import.meta.url), 'utf8')),
  )
  assert.equal(SCENE_CORPUS_FIXTURES.length, 5)
  assert.equal(new Set(SCENE_CORPUS_FIXTURES.map((fixture) => fixture.id)).size, 5)
  assert.deepEqual(
    SCENE_CORPUS_SCENES.map((fixture) => fixture.id),
    SCENE_CORPUS_FIXTURES.map((fixture) => fixture.id),
  )
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

test('the pinned glTF fixture loads on a Hermes-like host without TextDecoder', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'TextDecoder')
  assert.equal(Reflect.deleteProperty(globalThis, 'TextDecoder'), true)
  try {
    const fixture = SCENE_CORPUS_SCENES.find(({ id }) => id === 'gltf-pbr')
    assert.ok(fixture)
    const { scene } = await fixture.create(async () => MINIMAL_PBR_GLTF_SOURCE)
    assert.equal(scene.getObjectByName('Pinned_PBR_triangle')?.name, 'Pinned_PBR_triangle')
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'TextDecoder', descriptor)
    else Reflect.deleteProperty(globalThis, 'TextDecoder')
  }
})
