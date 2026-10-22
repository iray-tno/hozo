import assert from 'node:assert/strict'
import test from 'node:test'

import { blendColor, canBlendColor } from './color-transition.ts'

test('the bounded inherited motion gate uses the same colour parser as interruption blending', () => {
  for (const color of [
    '#000',
    '#123456',
    '#12345680',
    'transparent',
    blendColor('#000', '#fff', 0.5),
  ])
    assert.equal(canBlendColor(color), true, color)
  for (const color of ['tomato', 'rgb(0,0,0)', '#1234', 'rgba(1, 2, 3, 1e999)'])
    assert.equal(canBlendColor(color), false, color)
})

test('blends Tailwind hex colours at an interrupted transition point', () => {
  assert.equal(blendColor('#000', '#ffffff', 0.5), 'rgba(128, 128, 128, 1)')
})

test('fades from a transparent background without inventing an opaque start', () => {
  assert.equal(blendColor('transparent', '#ff0000', 0.25), 'rgba(64, 0, 0, 0.25)')
})

test('keeps unknown native colour syntax usable at the endpoints', () => {
  assert.equal(blendColor('navy', 'tomato', 0), 'navy')
  assert.equal(blendColor('navy', 'tomato', 1), 'tomato')
})

test('reads its own intermediate result when another transition interrupts it', () => {
  const halfway = blendColor('#000000', '#ff0000', 0.5)
  assert.equal(blendColor(halfway, '#00ff00', 0.5), 'rgba(64, 128, 0, 1)')
  const translucent = blendColor('transparent', '#ff0000', 0.25)
  assert.equal(blendColor(translucent, '#00000000', 0.5), 'rgba(32, 0, 0, 0.125)')
})

test('invalid serialized numbers retain the unknown-colour endpoint fallback', () => {
  const invalid = 'rgba(1, 2, 3, 1e999)'
  assert.equal(blendColor(invalid, '#ff0000', 0), invalid)
  assert.equal(blendColor(invalid, '#ff0000', 1), '#ff0000')
})
