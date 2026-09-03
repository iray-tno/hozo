// What #26 said to measure before building a spatial index.
//
// The condition it set was "spatial indexing only if continuous-event
// benchmarks justify it", and there was no benchmark -- so the condition
// could not be evaluated in either direction. It became worth answering
// once `onActiveChange` put the hit test on `onPointerMove`: before that
// a hit test ran on a press, and now it runs whenever a pointer moves.
//
// Measured on a desktop JavaScript engine, per call:
//
//     100 circles, miss           2.8 us
//     1000 circles, miss         17.5 us
//     10000 circles, miss       168.5 us
//     10000 circles, top hit      0.0 us
//     1000 circles, 50 groups    18.5 us
//
// Linear in the leaves, about 17ns each, and free when the pointer is
// over something near the top because the walk returns. A pointer move is
// coalesced to at most one per frame, so 10,000 shapes costs 2% of a
// 120Hz frame. That is the number #154 names as its Canvas-mode
// threshold, and it does not justify an index. Around 100,000 it would
// be a tenth of a frame, which is where the question becomes real.
//
// A phone's engine is slower than this one by some factor nobody here has
// measured, so the absolute bounds below are deliberately loose. What the
// assertions actually protect is the shape of the curve.

import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'

import { hitTestCanvas } from './hit-test.ts'
import type { CanvasScene } from './scene.tsx'

const viewport = { width: 800, height: 400 }
const interactive = () => true
/** A point no circle covers, so the walk visits every one of them. */
const miss = { x: 799, y: 399 }

/** A scatter plot, which is the shape of chart this cost belongs to. */
function scatter(count: number): CanvasScene {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    kind: 'circle' as const,
    props: { cx: (index * 37) % 800, cy: (index * 53) % 400, radius: 3 },
  }))
}

function nested(count: number, depth: number): CanvasScene {
  let scene = scatter(count)
  for (let level = 0; level < depth; level += 1) {
    scene = [
      {
        id: `g${level}`,
        kind: 'group' as const,
        props: { transform: { translateX: 1 } },
        children: scene,
      },
    ]
  }
  return scene
}

/** Microseconds per call, warmed so the first-run cost is not the answer. */
function perCall(scene: CanvasScene, point: { x: number; y: number }): number {
  for (let index = 0; index < 200; index += 1) hitTestCanvas(scene, point, viewport, interactive)
  const runs = 2000
  const started = performance.now()
  for (let index = 0; index < runs; index += 1) hitTestCanvas(scene, point, viewport, interactive)
  return ((performance.now() - started) / runs) * 1000
}

test('the walk stays linear in the number of shapes', () => {
  // The assertion that matters. A quadratic hit test would still pass a
  // fixed bound at 1,000 shapes and fall over at 10,000, which is exactly
  // the size a chart reaches -- so the curve is what is checked, and the
  // ratio is given a wide margin because a shared runner is noisy.
  const thousand = perCall(scatter(1_000), miss)
  const tenThousand = perCall(scatter(10_000), miss)
  const ratio = tenThousand / thousand
  assert.ok(
    ratio < 30,
    `ten times the shapes cost ${ratio.toFixed(1)} times as much, which is not linear`,
  )
})

test('a hit near the top costs almost nothing', () => {
  // Reverse paint order with an early return, which is why a pointer
  // resting on a shape is cheap however large the scene is. Losing it
  // would not fail the linearity test above.
  const scene = scatter(10_000)
  const onTop = { x: (9_999 * 37) % 800, y: (9_999 * 53) % 400 }
  assert.ok(hitTestCanvas(scene, onTop, viewport, interactive), 'the fixture point missed')
  assert.ok(
    perCall(scene, onTop) < perCall(scene, miss),
    'hitting the topmost shape cost as much as missing everything',
  )
})

test('nesting depth does not multiply the cost', () => {
  // Each group inverts a matrix on the way down. Fifty levels over a
  // thousand leaves is within noise of one, and a change that made depth
  // expensive would show here rather than in a chart nobody profiled.
  const shallow = perCall(nested(1_000, 1), miss)
  const deep = perCall(nested(1_000, 50), miss)
  assert.ok(deep < shallow * 4, `fifty levels cost ${(deep / shallow).toFixed(1)}x one level`)
})

test('ten thousand shapes stay well inside a frame', () => {
  // Loose on purpose: this runs on shared CI and says nothing about a
  // phone. It is a tripwire for the cost changing by an order of
  // magnitude, not a performance guarantee.
  const elapsed = perCall(scatter(10_000), miss)
  assert.ok(elapsed < 4_000, `a miss over 10,000 shapes took ${elapsed.toFixed(0)}us`)
})
