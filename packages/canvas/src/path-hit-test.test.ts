// Path hit testing, which is the last thing on #26 that anything here
// could do.
//
// The other shapes are answered by one shared predicate, because a
// rectangle is the same geometry under Canvas2D and under Skia. An
// arbitrary path is not: béziers, arcs and fill rules are exactly where
// rasterisers differ, so a third implementation in TypeScript would agree
// with neither of the two that actually draw. Each surface answers with
// its own -- `isPointInPath` on the Web, `SkPath.contains` on Native --
// which is the same reasoning `TextProps` gives for alignment.
//
// So these tests supply a tester rather than expecting one, and the
// interesting assertions are about the contract around it: what happens
// without one, what the fill rule does, and that a path clip goes through
// the same route.

import assert from 'node:assert/strict'
import test from 'node:test'

import { type CanvasPathHitTest, hitTestCanvas } from './hit-test.ts'
import type { CanvasScene } from './scene.tsx'

const viewport = { width: 100, height: 100 }
const interactive = () => true

/** A square from (0,0) to (40,40), with a hole if the rule says so. */
const SQUARE = 'M0 0 H40 V40 H0 Z'

/**
 * Stands in for a renderer, and records what it was asked.
 *
 * Deliberately not a path parser: what is under test is the contract, and
 * a parser here would be the third geometry this design exists to avoid.
 */
function tester(inside: boolean) {
  const asked: [string, string, { x: number; y: number }][] = []
  const hitTest: CanvasPathHitTest = (path, fillRule, point) => {
    asked.push([path, fillRule, point])
    return inside
  }
  return { asked, hitTest }
}

const scene: CanvasScene = [{ id: 'path', kind: 'path', props: { path: SQUARE } }]

test('a path refuses without a renderer to ask', () => {
  // The behaviour paths had before this existed, kept for a caller that
  // has no renderer -- a test, a server. A guess would be worse than a
  // refusal, which is the same choice `pointInNode` makes for text.
  assert.equal(hitTestCanvas(scene, { x: 20, y: 20 }, viewport, interactive), undefined)
})

test('a path is answered by the renderer, in the path’s own coordinates', () => {
  const { asked, hitTest } = tester(true)
  const hit = hitTestCanvas(scene, { x: 20, y: 20 }, viewport, interactive, {
    pathContains: hitTest,
  })
  assert.equal(hit?.id, 'path')
  assert.deepEqual(asked, [[SQUARE, 'nonzero', { x: 20, y: 20 }]])
})

test('the point is the one inside the ancestors’ transforms', () => {
  // The renderer knows nothing about the scene: it is handed a point in
  // the path's own space, with the viewport and every group already
  // inverted. Getting this wrong would ask about the right path at the
  // wrong place, and a "no" is indistinguishable from a miss.
  const grouped: CanvasScene = [
    {
      id: 'group',
      kind: 'group',
      props: { transform: { translateX: 30, translateY: 10 } },
      children: [{ id: 'path', kind: 'path', props: { path: SQUARE } }],
    },
  ]
  const { asked, hitTest } = tester(true)
  hitTestCanvas(grouped, { x: 50, y: 30 }, viewport, interactive, { pathContains: hitTest })
  assert.deepEqual(asked[0]?.[2], { x: 20, y: 20 })
})

test('the fill rule reaches the renderer as written', () => {
  const evenOdd: CanvasScene = [
    { id: 'path', kind: 'path', props: { path: SQUARE, fillRule: 'evenodd' } },
  ]
  const { asked, hitTest } = tester(true)
  hitTestCanvas(evenOdd, { x: 20, y: 20 }, viewport, interactive, { pathContains: hitTest })
  assert.equal(asked[0]?.[1], 'evenodd')
})

test('a renderer that says no is a miss, not an error', () => {
  const { hitTest } = tester(false)
  assert.equal(
    hitTestCanvas(scene, { x: 20, y: 20 }, viewport, interactive, { pathContains: hitTest }),
    undefined,
  )
})

test('a path clip goes through the same route', () => {
  // Path clips refused alongside paths and for the same reason, so they
  // are answered the same way. A clip has no fill rule of its own; both
  // renderers clip by their default, which is nonzero on each.
  const clipped: CanvasScene = [
    {
      id: 'clip',
      kind: 'clip',
      props: { path: SQUARE },
      children: [{ id: 'rect', kind: 'rect', props: { x: 0, y: 0, width: 100, height: 100 } }],
    },
  ]
  const { asked, hitTest } = tester(true)
  assert.equal(
    hitTestCanvas(clipped, { x: 20, y: 20 }, viewport, interactive, { pathContains: hitTest })?.id,
    'rect',
  )
  assert.deepEqual(asked, [[SQUARE, 'nonzero', { x: 20, y: 20 }]])

  const refused = tester(false)
  assert.equal(
    hitTestCanvas(clipped, { x: 20, y: 20 }, viewport, interactive, {
      pathContains: refused.hitTest,
    }),
    undefined,
    'a shape outside the clip was reachable',
  )
})

test('a path clip still refuses without a renderer', () => {
  const clipped: CanvasScene = [
    {
      id: 'clip',
      kind: 'clip',
      props: { path: SQUARE },
      children: [{ id: 'rect', kind: 'rect', props: { x: 0, y: 0, width: 100, height: 100 } }],
    },
  ]
  assert.equal(hitTestCanvas(clipped, { x: 20, y: 20 }, viewport, interactive), undefined)
})
