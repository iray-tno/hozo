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
// measured, and a saturated shared runner made the same call 30x slower in
// #330. There is deliberately no wall-clock assertion: the checks below
// compare work done in the same process and protect the shape of the curve.

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

/**
 * The cheapest of several runs, which is the number a comparison wants.
 *
 * Three of the tests below divide one measurement by another, and a
 * ratio is only as steady as its denominator. This runs on shared CI
 * next to whatever else the runner is doing, and contention only ever
 * adds time -- so the minimum of a few samples is the closest thing to
 * the cost of the code, while the mean is the cost of the code plus the
 * neighbours.
 *
 * The depth test below failed once on a macOS runner and passed on a
 * re-run of the same commit (#287). Nothing was slow: a `shallow` sample
 * that happened to run fast is enough, because the two sides do very
 * nearly the same work and the whole margin was absorbing noise in the
 * divisor.
 */
function bestOf(samples: number, scene: CanvasScene, point: { x: number; y: number }): number {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < samples; index += 1) {
    best = Math.min(best, perCall(scene, point))
  }
  return best
}
test('the walk stays linear in the number of shapes', () => {
  // The assertion that matters. A quadratic hit test would still pass a
  // fixed bound at 1,000 shapes and fall over at 10,000, which is exactly
  // the size a chart reaches -- so the curve is what is checked.
  //
  // Measured here: 21.6us and 213.9us, a ratio of 9.9 against the 10 it
  // should be. The bound is 30, which is three times that -- wide
  // because a shared runner is noisy even after `bestOf`, and because
  // what it has to separate is linear from quadratic, where the wrong
  // answer would be near 100.
  const thousand = bestOf(3, scatter(1_000), miss)
  const tenThousand = bestOf(3, scatter(10_000), miss)
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
  //
  // Measured here: 0.12us against 217.8us for the miss. The margin is
  // three orders of magnitude, so this one was never going to be
  // flaky -- it takes the steadier number for the same reason the
  // others do, and it costs nothing to be consistent about it.
  const scene = scatter(10_000)
  const onTop = { x: (9_999 * 37) % 800, y: (9_999 * 53) % 400 }
  assert.ok(hitTestCanvas(scene, onTop, viewport, interactive), 'the fixture point missed')
  assert.ok(
    bestOf(3, scene, onTop) < bestOf(3, scene, miss),
    'hitting the topmost shape cost as much as missing everything',
  )
})

test('nesting depth does not multiply the cost', () => {
  // Each group inverts a matrix on the way down. Fifty levels over a
  // thousand leaves is within noise of one, and a change that made depth
  // expensive would show here rather than in a chart nobody profiled.
  //
  // The narrowest margin in the file, which is why this is the one that
  // failed (#287): the two sides do very nearly the same work, so the
  // true ratio is about 1 and everything between there and the bound is
  // absorbing noise. Measured here at 1.10 -- 21.2us against 23.2us --
  // and best of five rather than three for that reason.
  //
  // The bound stays at 4. A change that made depth cost per-leaf work
  // would land near 50, not near 4, so nothing is caught by tightening
  // it and a re-run is bought by leaving it.
  const shallow = bestOf(5, nested(1_000, 1), miss)
  const deep = bestOf(5, nested(1_000, 50), miss)
  assert.ok(deep < shallow * 4, `fifty levels cost ${(deep / shallow).toFixed(1)}x one level`)
})
