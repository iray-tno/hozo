// Line hit testing, which refused every press until now.
//
// The region a press may land on is the region the renderer paints and no
// more. A tolerance wider than the stroke would be a control nobody can
// see, and #26 asks for the opposite of that in as many words. A chart
// that wants a finger-sized target draws a wider transparent line and says
// so in the scene, where it can be inspected.
//
// Both renderers default an unset `strokeWidth` to 1 and pass `lineCap`
// straight through -- Canvas2D as `lineCap`, Skia as `strokeCap`, both
// defaulting to `butt` -- so one shared test is the whole contract.

import assert from 'node:assert/strict'
import test from 'node:test'

import { hitTestCanvas } from './hit-test.ts'
import type { CanvasPaintProps, CanvasScene } from './scene.tsx'

const interactive = () => true
const viewport = { width: 100, height: 100 }

/** A horizontal line from (20,50) to (80,50), painted unless told otherwise. */
function line(props: CanvasPaintProps = {}): CanvasScene {
  return [
    {
      id: 'line',
      kind: 'line',
      props: { x1: 20, y1: 50, x2: 80, y2: 50, stroke: 'black', ...props },
    },
  ]
}

const hits = (scene: CanvasScene, x: number, y: number) =>
  hitTestCanvas(scene, { x, y }, viewport, interactive)?.id === 'line'

test('a press lands on the stroke and misses beside it', () => {
  const scene = line({ strokeWidth: 10 })
  assert.equal(hits(scene, 50, 50), true, 'the centre')
  assert.equal(hits(scene, 50, 54.9), true, 'inside the band')
  assert.equal(hits(scene, 50, 55.1), false, 'just outside the band')
  assert.equal(hits(scene, 50, 80), false, 'well clear of it')
})

test('the default stroke width is the platforms’ own, not a Hozo policy', () => {
  // Unset means 1 in Canvas2D and in Skia, so the band is half a unit.
  const scene = line()
  assert.equal(hits(scene, 50, 50.4), true)
  assert.equal(hits(scene, 50, 50.6), false)
})

test('a butt cap stops flat at the endpoints', () => {
  // The default in both renderers. Past the endpoint there is no paint,
  // so there is nothing to press.
  const scene = line({ strokeWidth: 10 })
  assert.equal(hits(scene, 20.1, 50), true, 'just inside the end')
  assert.equal(hits(scene, 19.9, 50), false, 'just past the end')
})

test('a round cap adds the half-disc it paints', () => {
  const scene = line({ strokeWidth: 10, lineCap: 'round' })
  assert.equal(hits(scene, 15.1, 50), true, 'inside the disc')
  assert.equal(hits(scene, 14.9, 50), false, 'past the disc')
  // And the disc is round: the same distance diagonally is outside it.
  assert.equal(hits(scene, 16.5, 54), false, 'the corner the disc does not fill')
})

test('a square cap extends the rectangle, corners and all', () => {
  const scene = line({ strokeWidth: 10, lineCap: 'square' })
  assert.equal(hits(scene, 15.1, 50), true, 'inside the extension')
  assert.equal(hits(scene, 14.9, 50), false, 'past the extension')
  // The corner a round cap leaves empty is painted by a square one, which
  // is the whole difference between them.
  assert.equal(hits(scene, 16.5, 54), true, 'the corner the square fills')
})

test('a diagonal line is a band around itself, not a bounding box', () => {
  const scene: CanvasScene = [
    {
      id: 'line',
      kind: 'line',
      props: { x1: 0, y1: 0, x2: 100, y2: 100, stroke: 'black', strokeWidth: 10 },
    },
  ]
  assert.equal(hits(scene, 50, 50), true, 'on the line')
  assert.equal(hits(scene, 10, 90), false, 'inside the bounding box, far from the line')
})

test('a line nobody can see cannot be pressed', () => {
  // The same condition the renderers use to decide whether to stroke at
  // all, which is why it is now written once and read three times. A hit
  // test that disagreed would report a press on nothing.
  assert.equal(hits(line({ stroke: 'none', strokeWidth: 10 }), 50, 50), false, 'stroke: none')
  assert.equal(hits(line({ strokeWidth: 0 }), 50, 50), false, 'zero width')
  assert.equal(
    hits(line({ stroke: undefined, strokeWidth: 10 }), 50, 50),
    false,
    'no stroke at all',
  )
})

test('a zero-length line is its cap, or nothing', () => {
  const dot = (props: CanvasPaintProps): CanvasScene => [
    {
      id: 'line',
      kind: 'line',
      props: { x1: 50, y1: 50, x2: 50, y2: 50, stroke: 'black', ...props },
    },
  ]
  assert.equal(hits(dot({ strokeWidth: 10 }), 50, 50), false, 'butt paints nothing')
  assert.equal(hits(dot({ strokeWidth: 10, lineCap: 'round' }), 54, 50), true, 'round is a disc')
  assert.equal(hits(dot({ strokeWidth: 10, lineCap: 'round' }), 56, 50), false, 'outside the disc')
  assert.equal(
    hits(dot({ strokeWidth: 10, lineCap: 'square' }), 54, 54),
    true,
    'square is a square',
  )
})

test('the stroke band moves with the viewBox, like every other shape', () => {
  const scene = line({ strokeWidth: 10 })
  const scaled = { width: 200, height: 200, viewBox: [0, 0, 100, 100] as const }
  assert.equal(hitTestCanvas(scene, { x: 100, y: 100 }, scaled, interactive)?.id, 'line')
  assert.equal(hitTestCanvas(scene, { x: 100, y: 130 }, scaled, interactive), undefined)
})
