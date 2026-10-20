// Rectangles test the offline reviewer's rejection boundary, not RN glyphs.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { PNG } from 'pngjs'
import { reviewTextCapture } from './review-text-evidence.mjs'

function fixture(platform, scale = 1) {
  const png = new PNG({ width: 300 * scale, height: 180 * scale })
  png.data.fill(255)
  const fill = ([x, y, width, height], rgb) => {
    for (let row = y * scale; row < (y + height) * scale; row++)
      for (let col = x * scale; col < (x + width) * scale; col++)
        png.data.set([...rgb, 255], (row * png.width + col) * 4)
  }
  fill([10, 50, 10, 10], [17, 17, 17])
  fill([20, 50, 10, 10], [19, 85, 187])
  fill([10, 20, 32, 12], [160, 32, 192])
  const points = [10, 50, 250, 90],
    marker = [10, 20, 42, 32]
  const bounds = points.map((v) => v * scale)
  const bytes = Buffer.concat(
    Array.from({ length: 40 * scale }, (_, y) =>
      png.data.subarray(
        ((50 * scale + y) * png.width + 10 * scale) * 4,
        ((50 * scale + y) * png.width + 250 * scale) * 4,
      ),
    ),
  )
  const capture = {
    label: 'production mount 1 tick 0',
    mount: 1,
    bounds,
    width: 240 * scale,
    height: 40 * scale,
    rgbaSha256: createHash('sha256').update(bytes).digest('hex'),
    ink: {
      root: 100 * scale * scale,
      nested: 100 * scale * scale,
      white: 9400 * scale * scale,
      valid: true,
    },
    frame: {
      bounds: marker.map((v) => v * scale),
      rgb: [160, 32, 192],
      expected: [160, 32, 192],
      valid: true,
    },
    ...(platform === 'ios'
      ? { pointBounds: points, markerPointBounds: marker, screenBounds: [0, 0, 300, 180] }
      : {}),
  }
  const ax =
    platform === 'ios'
      ? JSON.stringify([
          {
            type: 'Application',
            frame: { x: 0, y: 0, width: 300, height: 180 },
            children: [
              { AXLabel: capture.label, frame: { x: 10, y: 50, width: 240, height: 40 } },
              { AXLabel: 'Text frame production', frame: { x: 10, y: 20, width: 32, height: 12 } },
            ],
          },
        ])
      : `<hierarchy><node content-desc="${capture.label}" bounds="[10,50][250,90]"/><node content-desc="Text frame production" bounds="[10,20][42,32]"/></hierarchy>`
  const phase = { kind: 'static', mode: 'production', changed: false, tick: 0 }
  return { png, capture, phase, ax }
}

test('offline review independently reads Android pixels and iOS 2x/3x AX coordinates', () => {
  for (const [platform, scale] of [
    ['android', 1],
    ['ios', 2],
    ['ios', 3],
  ]) {
    const f = fixture(platform, scale)
    const result = reviewTextCapture(platform, f.phase, f.capture, PNG.sync.write(f.png), f.ax)
    assert.equal(result.width, 240 * scale)
    assert.equal(result.height, 40 * scale)
    assert.equal(result.mount, 1)
  }
})

test('a saved pass flag cannot hide altered pixels, hashes, ink, AX, marker or identity', () => {
  for (const platform of ['android', 'ios']) {
    for (const corrupt of [
      (f) => {
        f.png.data[(55 * f.png.width + 15) * 4]++
      },
      (f) => {
        f.png.data[(26 * f.png.width + 26) * 4]++
      },
      (f) => {
        f.capture.rgbaSha256 = '0'.repeat(64)
      },
      (f) => {
        f.capture.ink.root--
      },
      (f) => {
        f.capture.frame.expected[0]--
      },
      (f) => {
        f.capture.mount++
      },
      (f) => {
        f.capture.bounds[0]++
      },
      (f) => {
        f.ax = f.ax.replaceAll('Text frame production', 'Text frame ordinary')
      },
      (f) => {
        f.ax = f.ax.replaceAll('production mount 1', 'production mount 2')
      },
    ]) {
      const f = fixture(platform)
      corrupt(f)
      assert.throws(() =>
        reviewTextCapture(platform, f.phase, f.capture, PNG.sync.write(f.png), f.ax),
      )
    }
  }
})

test('missing or ambiguous AX nodes fail rather than selecting a convenient rectangle', () => {
  const f = fixture('ios')
  const tree = JSON.parse(f.ax)
  tree[0].children.push(tree[0].children[0])
  assert.throws(
    () => reviewTextCapture('ios', f.phase, f.capture, PNG.sync.write(f.png), JSON.stringify(tree)),
    /ambiguous/,
  )
  assert.throws(
    () => reviewTextCapture('ios', f.phase, f.capture, PNG.sync.write(f.png), '[]'),
    /missing\/ambiguous/,
  )
})
