// Gradients, which `@hozo/canvas` did not have and both platforms do.
//
// `@hozo/core`'s SVG namespace has had `LinearGradient` since it existed,
// so the mode #154 designates for ten thousand points was the one that
// could not fill an area chart. Nothing decided that; the paint props
// were strings and stayed strings.
//
// One description, two writings of it. Canvas2D builds a gradient object
// and calls `addColorStop` per stop; Skia takes a shader element with two
// parallel arrays. The tests here check the Web half through a recording
// context, and the Native half is asserted present in the Metro bundle by
// `examples/native-demo`.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { ReactNode } from 'react'

import { Canvas } from './index.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  create: (
    element: unknown,
    options?: { createNodeMock?: (e: { type: string }) => unknown },
  ) => void
  act(callback: () => void | Promise<void>): Promise<void>
}

/** Records the calls, and hands back a gradient that records its stops. */
function recordingSurface() {
  const calls: [string, ...unknown[]][] = []
  const gradient = {
    addColorStop: (offset: number, color: string) => calls.push(['addColorStop', offset, color]),
  }
  const state: Record<string, unknown> = { globalAlpha: 1 }
  const context = new Proxy(state, {
    get(target, property) {
      if (property in target) return target[property as string]
      return (...args: unknown[]) => {
        calls.push([String(property), ...args])
        return String(property).startsWith('create') ? gradient : undefined
      }
    },
    set(target, property, value) {
      target[property as string] = value
      calls.push([`set:${String(property)}`, value])
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return {
    calls,
    node: {
      getContext: () => context,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      setPointerCapture: () => undefined,
    },
  }
}

async function draw(children: ReactNode) {
  const surface = recordingSurface()
  await testRenderer.act(async () => {
    testRenderer.create(
      <Canvas width={100} height={100} accessibilityLabel="Chart">
        {children}
      </Canvas>,
      { createNodeMock: (e) => (e.type === 'canvas' ? surface.node : null) },
    )
  })
  return surface.calls
}

const find = (calls: [string, ...unknown[]][], name: string) =>
  calls.find(([called]) => called === name)
const all = (calls: [string, ...unknown[]][], name: string) =>
  calls.filter(([called]) => called === name)

const STOPS = [
  { offset: 0, color: '#000' },
  { offset: 1, color: '#fff' },
]

test('a linear gradient is built from the shape’s own coordinates', async () => {
  const calls = await draw(
    <Canvas.Rect
      x={0}
      y={0}
      width={40}
      height={40}
      fill={{ kind: 'linear', from: { x: 0, y: 0 }, to: { x: 40, y: 0 }, stops: STOPS }}
    />,
  )
  assert.deepEqual(find(calls, 'createLinearGradient'), ['createLinearGradient', 0, 0, 40, 0])
  assert.deepEqual(all(calls, 'addColorStop'), [
    ['addColorStop', 0, '#000'],
    ['addColorStop', 1, '#fff'],
  ])
})

test('a radial gradient is the single-circle form both platforms share', async () => {
  // Canvas2D takes two circles and Skia takes one, so the inner radius is
  // zero and the centres are the same. Promising the two-circle form
  // would be promising what one side cannot draw.
  const calls = await draw(
    <Canvas.Circle
      cx={20}
      cy={20}
      radius={20}
      fill={{ kind: 'radial', center: { x: 20, y: 20 }, radius: 20, stops: STOPS }}
    />,
  )
  assert.deepEqual(find(calls, 'createRadialGradient'), [
    'createRadialGradient',
    20,
    20,
    0,
    20,
    20,
    20,
  ])
})

test('a gradient stroke is a stroke', async () => {
  const calls = await draw(
    <Canvas.Rect
      x={0}
      y={0}
      width={40}
      height={40}
      fill="none"
      stroke={{ kind: 'linear', from: { x: 0, y: 0 }, to: { x: 40, y: 0 }, stops: STOPS }}
      strokeWidth={2}
    />,
  )
  assert.ok(find(calls, 'createLinearGradient'))
  assert.ok(find(calls, 'stroke'), 'the shape was not stroked')
  assert.equal(find(calls, 'fill'), undefined, 'a `none` fill was painted anyway')
})

test('a colour is still a colour', async () => {
  // The paint props took strings before this and still do. `'none'` still
  // means no paint, which is the case a gradient type could most easily
  // have broken.
  const calls = await draw(<Canvas.Rect x={0} y={0} width={10} height={10} fill="red" />)
  assert.deepEqual(find(calls, 'set:fillStyle'), ['set:fillStyle', 'red'])
  assert.equal(find(calls, 'createLinearGradient'), undefined)
})

test('a gradient is rebuilt per draw rather than kept', async () => {
  // A gradient belongs to the context and to the transform in force when
  // it was made, so one cached across frames would paint against a
  // transform that has moved. Two shapes, two gradients.
  const calls = await draw(
    <>
      <Canvas.Rect
        x={0}
        y={0}
        width={10}
        height={10}
        fill={{ kind: 'linear', from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, stops: STOPS }}
      />
      <Canvas.Rect
        x={20}
        y={0}
        width={10}
        height={10}
        fill={{ kind: 'linear', from: { x: 20, y: 0 }, to: { x: 30, y: 0 }, stops: STOPS }}
      />
    </>,
  )
  assert.equal(all(calls, 'createLinearGradient').length, 2)
})
