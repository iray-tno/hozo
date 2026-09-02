// A press on a line, driven through the Web surface rather than through
// `hitTestCanvas` alone.
//
// `line-hit-test.test.ts` pins the geometry. This asks the other half of
// the question: that `Canvas.Line` registers a handler at all. It did not
// -- it was a plain leaf with no `onPress` prop, so hit testing it would
// have found a target nothing could be dispatched to.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { Canvas, type CanvasPressEvent } from './index.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  create: (
    element: unknown,
    options?: { createNodeMock?: (element: { type: string }) => unknown },
  ) => { root: { findByType: (type: string) => { props: Record<string, unknown> } | undefined } }
  act(callback: () => void | Promise<void>): Promise<void>
}

/** A canvas element that records nothing and measures 200x100. */
function surface() {
  const context = new Proxy({ globalAlpha: 1, lineWidth: 1 } as Record<string, unknown>, {
    get: (target, property) => (property in target ? target[property as string] : () => undefined),
    set: (target, property, value) => {
      target[property as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return {
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    setPointerCapture: () => undefined,
  }
}

test('a press on a line reaches its handler, and one beside it does not', async () => {
  const presses: CanvasPressEvent[] = []
  const canvasNode = surface()
  let renderer: ReturnType<typeof testRenderer.create> | undefined
  await testRenderer.act(async () => {
    renderer = testRenderer.create(
      <Canvas width={200} height={100} viewBox={[0, 0, 100, 100]} accessibilityLabel="Chart">
        <Canvas.Line
          x1={20}
          y1={50}
          x2={80}
          y2={50}
          stroke="black"
          strokeWidth={10}
          onPress={(event) => presses.push(event)}
        />
      </Canvas>,
      { createNodeMock: (element) => (element.type === 'canvas' ? canvasNode : null) },
    )
  })

  const canvas = renderer?.root.findByType('canvas')
  assert.ok(canvas)
  const pointer = (x: number, y: number) => ({
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: canvasNode,
    isPrimary: true,
    pointerId: 1,
  })
  const down = canvas.props.onPointerDown as (event: ReturnType<typeof pointer>) => void
  const up = canvas.props.onPointerUp as (event: ReturnType<typeof pointer>) => void

  // The surface is 200x100 for a 100x100 viewBox, so `contain` scales by
  // one and centres: scene (50,50) is surface (100,50).
  down(pointer(100, 50))
  up(pointer(100, 50))
  assert.deepEqual(presses, [{ point: { x: 50, y: 50 }, surfacePoint: { x: 100, y: 50 } }])

  // Ten units below the stroke, which is well outside a band of five.
  down(pointer(100, 80))
  up(pointer(100, 80))
  assert.equal(presses.length, 1, 'a press clear of the stroke was dispatched anyway')
})
