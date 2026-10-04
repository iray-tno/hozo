import assert from 'node:assert/strict'
import test from 'node:test'
import { comparePixels, sample, verifyEffect } from './svg-filter-pixels.mjs'

function scene(kind) {
  const pixels = Array.from({ length: 96 * 96 * 4 }, () => 255)
  const image = { width: 96, height: 96, pixels }
  const color = kind === 'color' || kind === 'blend' ? [220, 40, 40] : [40, 80, 220]
  for (let y = 24; y < 64; y++) for (let x = 24; x < 64; x++) put(image, x, y, color)
  return image
}
function put(image, x, y, rgb) {
  image.pixels.splice((y * image.width + x) * 4, 3, ...rgb)
}

test('effect checks reject an unchanged filter and equally blank renderings', () => {
  for (const kind of ['color', 'blur', 'shadow', 'composition', 'blend']) {
    const control = scene(kind)
    assert.throws(() => verifyEffect(kind, control, control), /no visible effect/)
    const blank = { ...control, pixels: control.pixels.map(() => 255) }
    assert.equal(comparePixels(blank, blank).changed, 0)
    assert.throws(() => verifyEffect(kind, blank, blank), /source missing/)
  }
})

test('shadow checks reject lost offsets and reversed merge order', () => {
  for (const kind of ['shadow', 'composition']) {
    const control = scene(kind)
    const filtered = scene(kind)
    for (let y = 40; y < 76; y++) for (let x = 64; x < 76; x++) put(filtered, x, y, [220, 40, 40])
    assert.ok(verifyEffect(kind, control, filtered).changed > 32)
    put(filtered, 48, 48, [220, 40, 40])
    assert.throws(() => verifyEffect(kind, control, filtered), /merge order/)
    put(filtered, 48, 48, [40, 80, 220])
    put(filtered, 70, 50, [255, 255, 255])
    assert.throws(() => verifyEffect(kind, control, filtered), /offset red shadow missing/)
  }
})

test('parity reads alpha too and rejects incompatible image dimensions', () => {
  const before = scene('color')
  const after = scene('color')
  after.pixels[3] = 0
  assert.deepEqual(comparePixels(before, after), { changed: 1, maxDelta: 255 })
  assert.throws(() => comparePixels(before, { ...after, width: 95 }))
  assert.throws(() => sample(before, 96, 0), /outside image/)
})
