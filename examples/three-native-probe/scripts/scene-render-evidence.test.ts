import assert from 'node:assert/strict'
import test from 'node:test'
import { sampleSceneRenderEvidence, sceneEvidenceReady } from '../scene-render-evidence.ts'

test('a slow first GPU frame can establish evidence after the initial empty sample', () => {
  let evidence = { renderCalls: 0, textureCountDelta: 0 }
  evidence = sampleSceneRenderEvidence(
    evidence,
    { render: { calls: 0 }, memory: { textures: 3 } },
    3,
  )
  assert.deepEqual(evidence, { renderCalls: 0, textureCountDelta: 0 })
  evidence = sampleSceneRenderEvidence(
    evidence,
    { render: { calls: 250 }, memory: { textures: 6 } },
    3,
  )
  assert.deepEqual(evidence, { renderCalls: 250, textureCountDelta: 3 })
  evidence = sampleSceneRenderEvidence(
    evidence,
    { render: { calls: 0 }, memory: { textures: 2 } },
    3,
  )
  assert.deepEqual(evidence, { renderCalls: 250, textureCountDelta: 3 })
})

test('empty frames do not manufacture GPU rendering or texture evidence', () => {
  assert.deepEqual(
    sampleSceneRenderEvidence(
      { renderCalls: 0, textureCountDelta: 0 },
      { render: { calls: 0 }, memory: { textures: 0 } },
      0,
    ),
    { renderCalls: 0, textureCountDelta: 0 },
  )
})

test('freeze only after real draws and the required animation evidence', () => {
  assert.equal(sceneEvidenceReady({ renderCalls: 0, textureCountDelta: 3 }), false)
  const rendered = { renderCalls: 10, textureCountDelta: 3 }
  assert.equal(sceneEvidenceReady(rendered), true)
  assert.equal(sceneEvidenceReady(rendered, { frames: 1, angle: 0.04 }), false)
  assert.equal(sceneEvidenceReady(rendered, { frames: 2, angle: 0 }), false)
  assert.equal(sceneEvidenceReady(rendered, { frames: 2, angle: NaN }), false)
  assert.equal(sceneEvidenceReady(rendered, { frames: 2, angle: 0.04 }), true)
})
