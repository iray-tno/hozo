import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { Canvas, type CanvasPressEvent } from './index.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  act(callback: () => void | Promise<void>): Promise<void>
  create(node: React.ReactNode, options: { createNodeMock(element: { type: unknown }): unknown }): {
    root: {
      findByType(type: string): { props: Record<string, unknown> }
    }
    update(node: React.ReactNode): void
    unmount(): void
  }
}

// React 19 makes this explicit for renderers that flush effects in tests.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('shapes composed through user components reach the shared scene renderer', async () => {
  const calls: string[] = []
  const context = new Proxy({
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as Record<string, unknown>, {
    get(target, property) {
      if (property in target) return target[property as string]
      return () => calls.push(String(property))
    },
    set(target, property, value) {
      target[property as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  const canvasNode = {
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 80, height: 40 }),
  }
  let barRenders = 0
  function Bars() {
    barRenders += 1
    return (
      <Canvas.Group opacity={0.8}>
        <Canvas.Rect width={30} height={20} fill="#2563eb" />
      </Canvas.Group>
    )
  }

  let renderer: ReturnType<typeof testRenderer.create> | undefined
  await testRenderer.act(async () => {
    renderer = testRenderer.create(
      <Canvas decorative width={80} height={40}><Bars /></Canvas>,
      { createNodeMock: (element) => element.type === 'canvas' ? canvasNode : null },
    )
  })

  assert.ok(calls.includes('rect'), `scene never drew the nested Rect: ${calls.join(', ')}`)
  assert.equal(barRenders, 1, 'observing a scene revision rerendered the marker subtree')
  await testRenderer.act(async () => renderer?.unmount())
})

test('Web pointer presses dispatch to the same target without redrawing for handler changes', async () => {
  const drawCalls: string[] = []
  const context = new Proxy({
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as Record<string, unknown>, {
    get(target, property) {
      if (property in target) return target[property as string]
      return () => drawCalls.push(String(property))
    },
    set(target, property, value) {
      target[property as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  const canvasNode = {
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    setPointerCapture: () => undefined,
  }
  let firstHandlerCalls = 0
  const secondEvents: unknown[] = []
  const firstHandler = () => {
    firstHandlerCalls += 1
  }
  const secondHandler = (event: unknown) => {
    secondEvents.push(event)
  }
  const viewBox = [0, 0, 100, 100] as const
  const scene = (onPress: (event: CanvasPressEvent) => void, disabled = false) => (
    <Canvas width={200} height={100} viewBox={viewBox} accessibilityLabel="Chart">
      <Canvas.Rect x={40} y={40} width={20} height={20} onPress={onPress} disabled={disabled} />
    </Canvas>
  )

  let renderer: ReturnType<typeof testRenderer.create> | undefined
  await testRenderer.act(async () => {
    renderer = testRenderer.create(scene(firstHandler), {
      createNodeMock: (element) => element.type === 'canvas' ? canvasNode : null,
    })
  })
  const drawsAfterMount = drawCalls.filter((call) => call === 'clearRect').length

  await testRenderer.act(async () => renderer?.update(scene(secondHandler)))
  assert.equal(
    drawCalls.filter((call) => call === 'clearRect').length,
    drawsAfterMount,
    'changing only an event handler redrew the Canvas',
  )

  const canvas = renderer?.root.findByType('canvas')
  assert.ok(canvas)
  const pointer = (x: number, y: number, pointerId: number) => ({
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: canvasNode,
    isPrimary: true,
    pointerId,
  })
  const pointerDown = canvas.props.onPointerDown as (event: ReturnType<typeof pointer>) => void
  const pointerUp = canvas.props.onPointerUp as (event: ReturnType<typeof pointer>) => void

  pointerDown(pointer(100, 50, 1))
  pointerUp(pointer(100, 50, 1))
  assert.equal(firstHandlerCalls, 0)
  assert.deepEqual(secondEvents, [{
    point: { x: 50, y: 50 },
    surfacePoint: { x: 100, y: 50 },
  }])

  pointerDown(pointer(100, 50, 2))
  pointerUp(pointer(20, 50, 2))
  assert.equal(secondEvents.length, 1, 'a release outside the pressed shape activated it')

  await testRenderer.act(async () => renderer?.update(scene(secondHandler, true)))
  assert.equal(
    drawCalls.filter((call) => call === 'clearRect').length,
    drawsAfterMount,
    'disabling only interaction redrew the Canvas',
  )
  pointerDown(pointer(100, 50, 3))
  pointerUp(pointer(100, 50, 3))
  assert.equal(secondEvents.length, 1, 'a disabled shape remained interactive')

  await testRenderer.act(async () => renderer?.unmount())
})
