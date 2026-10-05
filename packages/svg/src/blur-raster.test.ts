import assert from 'node:assert/strict'
import test from 'node:test'
import { androidBlurDeviation, svgRasterScale } from './blur-raster.ts'

test('Android deviation inverts the actual pixel kernel rather than assuming radius is sigma', () => {
  for (const density of [1, 2, 2.625, 2.75, 3]) {
    for (const sigma of [0.8, 1, 2, 3]) {
      const encoded = androidBlurDeviation(sigma, { x: density, y: density })
      assert.ok(encoded)
      const radius = Math.min(2 * Math.max(...encoded), 25)
      assert.ok(Math.abs(0.4 * radius + 0.6 - sigma * density) < 0.000001)
    }
  }
  // The CI scene wants 4 SVG units at 2.625 pixels/unit. Old upstream got
  // sigma=3.8 bitmap pixels; the adapter requests sigma=10.5 bitmap pixels.
  assert.deepEqual(androidBlurDeviation('4', { x: 2.625, y: 2.625 }), [12.375, 12.375])
  assert.equal(0.4 * (2 * 12.375) + 0.6, 10.5)
})

test('scalar, string and pair forms keep zero a bypass without changing source props', () => {
  const scale = { x: 2, y: 3 }
  const pair = [2, 3]
  assert.deepEqual(androidBlurDeviation(pair, scale), [4.25, 10.5])
  assert.deepEqual(androidBlurDeviation('2 3', scale), [4.25, 10.5])
  assert.deepEqual(androidBlurDeviation('2,3', scale), [4.25, 10.5])
  assert.deepEqual(pair, [2, 3])
  assert.deepEqual(androidBlurDeviation(0, scale), [0, 0])
  assert.deepEqual(androidBlurDeviation('0 0', scale), [0, 0])
  assert.equal(androidBlurDeviation(undefined, scale), undefined)
  assert.ok((androidBlurDeviation(0.1, scale)?.[0] ?? 0) > 0)
})

test('raster scale includes root viewBox, meet/slice and nonuniform viewport scaling', () => {
  assert.deepEqual(svgRasterScale(96, 96, '0 0 96 96', undefined, 2.625), { x: 2.625, y: 2.625 })
  assert.deepEqual(svgRasterScale(200, 100, '0 0 100 100', undefined, 2), { x: 2, y: 2 })
  assert.deepEqual(svgRasterScale(200, 100, '0 0 100 100', 'xMidYMid slice', 2), { x: 4, y: 4 })
  assert.deepEqual(svgRasterScale(200, 100, '0 0 100 100', 'none', 2), { x: 4, y: 2 })
  assert.deepEqual(svgRasterScale(50, 50, '0,0,100,100', undefined, 3), { x: 1.5, y: 1.5 })
  for (const box of ['0 0 0 10', 'bad', '0 0 -1 20', '0 0 Infinity 10']) {
    assert.deepEqual(svgRasterScale(100, 100, box, undefined, 2), { x: 2, y: 2 })
  }
  assert.deepEqual(svgRasterScale('100%', undefined, '0 0 100 100', undefined, 2), { x: 2, y: 2 })
})

test('one-pass compensation does not pretend to remove the upstream large-radius cap', () => {
  const encoded = androidBlurDeviation(20, { x: 3, y: 3 })
  assert.ok(encoded)
  const radius = Math.min(2 * Math.max(...encoded), 25)
  assert.equal(0.4 * radius + 0.6, 10.6)
  assert.ok(10.6 < 20 * 3)
})
