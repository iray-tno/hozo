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
const runtime = require('@hozo/primitives/generated/grid') as {
  HozoGrid: unknown
  HozoGridItem: unknown
}

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
 * Mounts something that measures, counts its commits, and replays layout.
 *
 * A `Profiler` rather than a counter in a wrapper component: the state
 * lives inside the component under test and re-renders only it, so a
 * counter one level up stays at one forever and every assertion here
 * passes without measuring anything. The "really changed" tests caught
 * that -- a real width change has to move the number, and it did not.
 *
 * `create` inside `act`, because React 19 does not flush outside one and
 * the root comes back unmounted -- the same trap `native-render.ts`
 * documents.
 */
function mountMeasured(id: string, element: () => unknown) {
  let renders = 0
  const Counted = () =>
    react.createElement(
      react.Profiler,
      {
        id,
        onRender: () => {
          renders += 1
        },
      },
      element(),
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
   * first pass tells it the width, the second the heights that width
   * produced. Asserting from the first pass would call that convergence a
   * loop. What these tests exist to catch is the case where it never
   * arrives.
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

const mounted = () => mountMeasured('grid', measuringGrid)
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

// --- the same hazard, one component over ------------------------------------

const container = require('@hozo/primitives/generated/container') as { HozoContainer: unknown }

/** A container query, which stores a width and renders from it. */
const mountedContainer = () =>
  mountMeasured('container', () =>
    react.createElement(container.HozoContainer, { hozoContainerName: 'card' }, 'inside'),
  )
test('a container query settles on the same width too', () => {
  // `HozoContainer` had `current === measured`, which is what `HozoGrid`
  // had on the measurement that looped. Nothing has seen this one loop --
  // no screen in this repository uses a container query yet -- and it is
  // the same three ingredients: a stored width, a render that depends on
  // it, and a float coming back from Yoga. Fixing only the one that was
  // caught is how a repository gets two implementations of one rule.
  const box = mountedContainer()
  assert.ok(box.layout(373) >= 1, 'the container reports no layout')
  assert.ok(Number.isFinite(box.settle(373)), 'the container never settled')
  const settled = box.renders()
  for (const width of [372.99998, 373.00002, 372.99999]) box.layout(width)
  assert.equal(
    box.renders(),
    settled,
    `the container re-rendered ${box.renders() - settled} times for a width that did not change`,
  )
})

test('and follows a width that really moved', () => {
  const box = mountedContainer()
  box.settle(373)
  const settled = box.renders()
  box.layout(812)
  assert.ok(box.renders() > settled, 'the container ignored a real width change')
})

// --- opt-in self-measured box (`translate*`, `rounded*`, `gap*` calc) -------

const measuredBox = require('@hozo/primitives/generated/measured-box') as {
  HozoSelfMeasured: unknown
  HozoMeasuredParent: unknown
  HozoParentSizeQuery: unknown
}

test('HozoSelfMeasured settles on sub-pixel wobble, forwards onLayout, and composes style', () => {
  const seenSizes: Array<{ width: number; height: number }> = []
  let forwarded = 0
  const box = mountMeasured('self-measured', () =>
    react.createElement(
      measuredBox.HozoSelfMeasured,
      {
        hozoSelfStyle: (size: { width: number; height: number }) => {
          seenSizes.push(size)
          return { borderRadius: Math.max(0, Math.min(size.width, size.height) * 0.5 - 4) }
        },
        style: [{ opacity: 0.9 }],
        onLayout: () => {
          forwarded += 1
        },
      },
      'content',
    ),
  )
  assert.ok(box.layout(200) >= 1, 'HozoSelfMeasured reports no layout')
  assert.ok(Number.isFinite(box.settle(200)), 'HozoSelfMeasured never settled')
  const settled = box.renders()
  for (const width of [199.99998, 200.00002, 199.99999]) box.layout(width)
  assert.equal(
    box.renders(),
    settled,
    `HozoSelfMeasured re-rendered ${box.renders() - settled} times for sub-pixel wobble`,
  )
  assert.ok(forwarded >= 4, 'user onLayout was not forwarded')
  assert.deepEqual(seenSizes.at(-1), { width: 200, height: 40 })

  box.layout(320)
  assert.ok(box.renders() > settled, 'HozoSelfMeasured ignored a real width change')
  assert.deepEqual(seenSizes.at(-1), { width: 320, height: 40 })
})

test('HozoContainerSizeQuery exposes both width and height from HozoContainer', () => {
  const containerFull = require('@hozo/primitives/generated/container') as {
    HozoContainer: unknown
    HozoContainerSizeQuery: unknown
  }
  let observed: { width: number | undefined; height: number | undefined } | undefined
  const box = mountMeasured('container-size', () =>
    react.createElement(
      containerFull.HozoContainer,
      null,
      react.createElement(
        containerFull.HozoContainerSizeQuery,
        null,
        (sizes: Record<string, { width: number | undefined; height: number | undefined }>) => {
          observed = sizes['']
          return null
        },
      ),
    ),
  )
  box.settle(373)
  assert.deepEqual(observed, { width: 373, height: 40 })
})

test('HozoMeasuredParent subtracts border and padding, resolves mainAxisSize, and settles on wobble', () => {
  type ParentSize = {
    width: number
    height: number
    paddingBoxWidth: number
    paddingBoxHeight: number
    mainAxisSize: number
  }
  let observed: ParentSize | undefined
  let forwarded = 0
  const box = mountMeasured('measured-parent', () =>
    react.createElement(
      measuredBox.HozoMeasuredParent,
      {
        style: [
          {
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 12,
            borderWidth: 2,
            flexDirection: 'row',
          },
        ],
        onLayout: () => {
          forwarded += 1
        },
      },
      react.createElement(measuredBox.HozoParentSizeQuery, null, (size: ParentSize | undefined) => {
        observed = size
        return null
      }),
    ),
  )
  // Before first onLayout, parent size is undefined (never guessed).
  assert.equal(observed, undefined)
  assert.ok(Number.isFinite(box.settle(300)), 'HozoMeasuredParent never settled')
  // Border box is 300x40 -> border 2 on each side -> padding box 296x36
  // Padding 16+16 horizontal, 8+12 vertical -> content box 264x16
  // flexDirection: 'row' -> mainAxisSize === content width (264)
  assert.deepEqual(observed, {
    width: 264,
    height: 16,
    paddingBoxWidth: 296,
    paddingBoxHeight: 36,
    mainAxisSize: 264,
  })
  const settled = box.renders()
  for (const width of [299.99998, 300.00002, 299.99999]) box.layout(width)
  assert.equal(
    box.renders(),
    settled,
    `HozoMeasuredParent re-rendered ${box.renders() - settled} times for sub-pixel wobble`,
  )
  assert.ok(forwarded >= 4, 'parent onLayout was not forwarded')

  // Default column main axis uses content height for mainAxisSize.
  let columnObserved: ParentSize | undefined
  const col = mountMeasured('measured-parent-column', () =>
    react.createElement(
      measuredBox.HozoMeasuredParent,
      { style: { padding: 4 } },
      react.createElement(measuredBox.HozoParentSizeQuery, null, (size: ParentSize | undefined) => {
        columnObserved = size
        return null
      }),
    ),
  )
  col.settle(200)
  assert.deepEqual(columnObserved, {
    width: 192,
    height: 32,
    paddingBoxWidth: 200,
    paddingBoxHeight: 40,
    mainAxisSize: 32,
  })
})

test('definite-height HozoGrid evaluates calc() row tracks against content-box height and settles', () => {
  const seenHeights: number[] = []
  let renders = 0
  let root: Root | undefined
  const Scene = () =>
    react.createElement(
      react.Profiler,
      {
        id: 'definite-height-grid',
        onRender: () => {
          renders += 1
        },
      },
      react.createElement(
        measuredBox.HozoMeasuredParent,
        { style: { height: 256, paddingVertical: 16 } },
        react.createElement(
          measuredBox.HozoParentSizeQuery,
          null,
          (parent: { height: number } | undefined) =>
            react.createElement(
              runtime.HozoGrid,
              {
                tracks: [{ kind: 'fr', value: 1 }],
                rowTracks: [
                  {
                    kind: 'calc',
                    evaluate: (h: number) => {
                      seenHeights.push(h)
                      return Math.max(0, h - 32)
                    },
                  },
                ],
                containerHeight: parent?.height,
                columnGap: 0,
                rowGap: 0,
              },
              react.createElement('View', null, 'Cell'),
            ),
        ),
      ),
    )

  renderer.act(() => {
    root = renderer.create(react.createElement(Scene))
  })
  const fireLayout = (width: number, height: number) => {
    const targets = root!.root.findAll((node) => typeof node.props.onLayout === 'function')
    renderer.act(() => {
      for (const target of targets) {
        ;(target.props.onLayout as (event: unknown) => void)({
          nativeEvent: { layout: { width, height } },
        })
      }
    })
  }
  // Outer border-box is 300x256 with paddingVertical: 16 -> content-box height = 224.
  fireLayout(300, 256)
  fireLayout(300, 256)
  const settled = renders
  for (const [w, h] of [
    [299.99998, 256.00002],
    [300.00002, 255.99998],
  ]) {
    fireLayout(w, h)
  }
  assert.equal(
    renders,
    settled,
    `definite-height HozoGrid re-rendered ${renders - settled} times on float wobble`,
  )
  assert.equal(seenHeights.at(-1), 224)
  // Cell gets evaluated row height 224 - 32 = 192 inside the 224px grid container.
  const cell = root!.root.findAll(
    (node) =>
      typeof node.props.style === 'object' &&
      node.props.style !== null &&
      (node.props.style as Record<string, unknown>).position === 'absolute',
  )[0]
  assert.equal((cell?.props.style as Record<string, unknown> | undefined)?.height, 192)
})
