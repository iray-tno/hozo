import assert from 'node:assert/strict'
import test from 'node:test'
import { sampleSceneRenderEvidence } from '../scene-render-evidence.ts'

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
