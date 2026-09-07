// A measured layout has to stop measuring.
//
// `HozoGrid` feeds its own input: the container's height comes from the
// measured heights of its cells, so every height it learns relays the
// container out and fires the container's `onLayout` again. That is fine
// while the width it reads back is the same number. `onLayout` reports
// floats, and it is not always the same number.
//
// On an emulator it never was. `uiautomator dump` could not find an idle
// window across six attempts, the frame counter climbed by about
// twenty-four a second with nobody touching the screen, and a screenshot
// showed the acceptance screen half-built and stopped at this grid.
//
// Nothing here could see it. `grid.test.ts` checks the solver, which is
// pure arithmetic and correct. `grid.performance.test.ts` counts what the
// solver costs. The renderer's own tests drive `onLayout` with the boxes a
// test chose -- and a test chooses round numbers, so the one input that
// provokes this is the one nobody supplied.
//
// This supplies it: the same width, off by a hundred-thousandth, which is
// what a real Yoga pass produces and what a hand-written fixture never
// does.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  Profiler: unknown
}

interface Instance {
  props: Record<string, unknown>
}
interface Root {
  root: { findAll: (predicate: (node: Instance) => boolean) => Instance[] }
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => Root
  act: (callback: () => void) => void
}
const runtime = require('@hozo/runtime') as { HozoGrid: unknown; HozoGridItem: unknown }

/** A grid that measures, which needs a row span or an explicit row track. */
const measuringGrid = () =>
  react.createElement(
    runtime.HozoGrid,
    {
      tracks: [
        { kind: 'fr', value: 1 },
        { kind: 'fr', value: 1 },
      ],
      columnGap: 8,
      rowGap: 8,
    },
    react.createElement(runtime.HozoGridItem, { rowSpan: 2, key: 'tall' }, 'Tall'),
    react.createElement(runtime.HozoGridItem, { key: 'top' }, 'Top'),
    react.createElement(runtime.HozoGridItem, { key: 'bottom' }, 'Bottom'),
  )

/**
 * A mounted grid, a render counter, and a way to replay a layout pass.
 *
 * `create` inside `act`, because React 19 does not flush outside one and
 * the root comes back unmounted -- the same trap `native-render.ts`
 * documents.
 */
function mounted() {
  // A `Profiler` rather than a counter in a wrapper component. The
  // wrapper never re-renders: `setWidth` lives inside `HozoGrid` and
  // re-renders only it, so a counter one level up stays at one forever
  // and every assertion here passes without measuring anything. The
  // third test caught that -- a real width change has to move the
  // number, and it did not.
  let renders = 0
  const Counted = () =>
    react.createElement(
      react.Profiler,
      {
        id: 'grid',
        onRender: () => {
          renders += 1
        },
      },
      measuringGrid(),
    )
  let root: Root | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(Counted))
  })
  const mountedRoot = root as Root

  /** Reports `width` to every element that asked for its layout. */
  const layout = (width: number) => {
    const targets = mountedRoot.root.findAll((node) => typeof node.props.onLayout === 'function')
    renderer.act(() => {
      for (const target of targets) {
        ;(target.props.onLayout as (event: unknown) => void)({
          nativeEvent: { layout: { width, height: 40 } },
        })
      }
    })
    return targets.length
  }

  /**
   * Replays one width until the commits stop, and says how many it took.
   *
   * A measured layout converges over more than one pass by design -- the
   * first tells it the width, the second the heights that width produced.
   * Asserting from the first pass would call that convergence a loop. What
   * this exists to catch is the case where it never arrives.
   */
  const settle = (width: number, limit = 6) => {
    for (let pass = 0; pass < limit; pass += 1) {
      const before = renders
      layout(width)
      if (renders === before) return pass + 1
    }
    return Number.POSITIVE_INFINITY
  }

  return { layout, settle, renders: () => renders }
}

test('the harness reaches the grid at all', () => {
  // Guards the two below. Both pass trivially if nothing reports layout,
  // which is exactly how a test of a measured layout goes quiet without
  // failing.
  const grid = mounted()
  assert.ok(grid.layout(373) >= 2, 'fewer than two elements report their layout')
})

test('a grid that measures does not re-render on a sub-pixel width', () => {
  // The assertion the emulator was making all along. Widths a
  // hundred-thousandth apart are the same width, and treating them as
  // different is a layout that never converges.
  const grid = mounted()
  assert.ok(Number.isFinite(grid.settle(373)), 'the grid never settled on a fixed width')
  const settled = grid.renders()
  for (const width of [372.99998, 373.00002, 372.99999, 373.00001, 372.99997]) {
    grid.layout(width)
  }
  assert.equal(
    grid.renders(),
    settled,
    `the grid re-rendered ${grid.renders() - settled} times for a width that did not change`,
  )
})

test('a width that really changed is still taken', () => {
  // The guard has to be a tolerance, not a lock. A rotation moves the
  // width by hundreds of pixels and the grid has to follow, or the fix for
  // the loop is a grid that never measures at all.
  const grid = mounted()
  grid.settle(373)
  const settled = grid.renders()
  grid.layout(812)
  assert.ok(grid.renders() > settled, 'the grid ignored a real width change')
})
