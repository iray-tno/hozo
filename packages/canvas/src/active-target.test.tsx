// One notion of "the shape being indicated", from whichever input the
// device has.
//
// A tooltip is one feature, so a chart should not carry a hover
// implementation and a touch implementation and reconcile them. What
// arrives at `onActiveChange` is the same either way, and the handler
// cannot tell which input produced it -- deliberately, since the answer
// never changes what a tooltip does.
//
// Driven through the Web surface. The Native one is the same handler with
// a different import: React Native's `View` declares the whole W3C
// pointer set and its `PointerEvent` is `NativeSyntheticEvent<
// NativePointerEvent>`, carrying `pointerType` and `offsetX`/`offsetY`
// exactly as the browser's does.

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
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture: () => undefined,
  }
}

/** The fields the surface actually reads off a pointer event. */
interface PointerLike {
  button: number
  clientX: number
  clientY: number
  currentTarget: unknown
  isPrimary: boolean
  pointerId: number
  pointerType: string
}

/** Two shapes side by side, each reporting when it is indicated. */
async function mount(changes: [string, CanvasPressEvent | undefined][]) {
  const canvasNode = surface()
  let renderer: ReturnType<typeof testRenderer.create> | undefined
  await testRenderer.act(async () => {
    renderer = testRenderer.create(
      <Canvas width={100} height={100} accessibilityLabel="Chart">
        <Canvas.Rect
          x={0}
          y={0}
          width={40}
          height={100}
          onActiveChange={(event) => changes.push(['left', event])}
        />
        <Canvas.Rect
          x={60}
          y={0}
          width={40}
          height={100}
          onActiveChange={(event) => changes.push(['right', event])}
        />
      </Canvas>,
      { createNodeMock: (element) => (element.type === 'canvas' ? canvasNode : null) },
    )
  })
  const canvas = renderer?.root.findByType('canvas')
  assert.ok(canvas)
  const event = (x: number, y: number, pointerType: string): PointerLike => ({
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: canvasNode,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  })
  const call = (name: string) => canvas.props[name] as ((event: PointerLike) => void) | undefined
  return {
    move: (x: number, y: number) => call('onPointerMove')?.(event(x, y, 'mouse')),
    leave: () => (canvas.props.onPointerLeave as (() => void) | undefined)?.(),
    touchDown: (x: number, y: number) => call('onPointerDown')?.(event(x, y, 'touch')),
    touchUp: (x: number, y: number) => call('onPointerUp')?.(event(x, y, 'touch')),
    moveAsTouch: (x: number, y: number) => call('onPointerMove')?.(event(x, y, 'touch')),
  }
}

test('a mouse indicates by hovering, and stops when it leaves', async () => {
  const changes: [string, CanvasPressEvent | undefined][] = []
  const surface = await mount(changes)

  surface.move(20, 50)
  assert.deepEqual(changes, [['left', { point: { x: 20, y: 50 }, surfacePoint: { x: 20, y: 50 } }]])

  surface.leave()
  assert.deepEqual(changes.at(-1), ['left', undefined])
})

test('moving within one shape reports once, not once per pixel', async () => {
  // What makes this usable from `onPointerMove` at all. The store compares
  // the target before telling anyone.
  const changes: [string, CanvasPressEvent | undefined][] = []
  const surface = await mount(changes)

  surface.move(10, 50)
  surface.move(20, 50)
  surface.move(30, 50)
  assert.equal(changes.length, 1)
})

test('crossing to another shape tells the one that lost it first', async () => {
  const changes: [string, CanvasPressEvent | undefined][] = []
  const surface = await mount(changes)

  surface.move(20, 50)
  surface.move(80, 50)
  assert.deepEqual(
    changes.map(([id, event]) => [id, event === undefined ? 'off' : 'on']),
    [
      ['left', 'on'],
      ['left', 'off'],
      ['right', 'on'],
    ],
  )
})

test('crossing the gap between them stops indicating anything', async () => {
  const changes: [string, CanvasPressEvent | undefined][] = []
  const surface = await mount(changes)

  surface.move(20, 50)
  surface.move(50, 50)
  assert.deepEqual(changes.at(-1), ['left', undefined])
})

test('a finger indicates by holding, and stops when it lifts', async () => {
  const changes: [string, CanvasPressEvent | undefined][] = []
  const surface = await mount(changes)

  surface.touchDown(20, 50)
  assert.deepEqual(changes, [['left', { point: { x: 20, y: 50 }, surfacePoint: { x: 20, y: 50 } }]])

  surface.touchUp(20, 50)
  assert.deepEqual(changes.at(-1), ['left', undefined])
})

test('a finger does not hover', async () => {
  // A finger emits `pointermove` too, but only while touching. Treating
  // that as hover would make a tap indicate the shape it landed on and
  // keep indicating it after the finger had gone.
  const changes: [string, CanvasPressEvent | undefined][] = []
  const surface = await mount(changes)

  surface.moveAsTouch(20, 50)
  assert.deepEqual(changes, [])
})
