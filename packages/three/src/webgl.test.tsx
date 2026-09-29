import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { createRef } from 'react'
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from 'three'

import { ThreeCanvas, type ThreeCanvasHandle } from './webgl-renderer.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  act(callback: () => void | Promise<void>): Promise<void>
  create(
    node: React.ReactNode,
    options: { createNodeMock(element: { type: unknown }): unknown },
  ): {
    root: {
      findByType(type: string): { props: Record<string, unknown> }
    }
    unmount(): void
    update(node: React.ReactNode): void
  }
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('classic WebGL surface owns renderer lifecycle and demand invalidation', async () => {
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  const handle = createRef<ThreeCanvasHandle>()
  const canvas = { kind: 'canvas' }
  const calls: string[] = []
  const renderer = {
    dispose: () => calls.push('dispose'),
    render: (nextScene: Scene, nextCamera: PerspectiveCamera) => {
      assert.equal(nextScene, scene)
      assert.equal(nextCamera, camera)
      calls.push('render')
    },
    setPixelRatio: (ratio: number) => calls.push(`ratio:${ratio}`),
    setSize: (width: number, height: number, updateStyle: boolean) =>
      calls.push(`size:${width}x${height}:${updateStyle}`),
  } as unknown as WebGLRenderer
  let root: ReturnType<typeof testRenderer.create> | undefined

  await testRenderer.act(async () => {
    root = testRenderer.create(
      <ThreeCanvas
        ref={handle}
        decorative
        scene={scene}
        camera={camera}
        width={320}
        height={180}
        pixelRatio={2}
        createRenderer={(node) => {
          assert.equal(node, canvas)
          calls.push('create')
          return renderer
        }}
      />,
      { createNodeMock: (element) => (element.type === 'canvas' ? canvas : null) },
    )
  })

  assert.deepEqual(calls.slice(0, 4), ['create', 'ratio:2', 'size:320x180:false', 'render'])
  await testRenderer.act(async () => handle.current?.invalidate())
  assert.equal(calls.filter((call) => call === 'render').length, 2)
  assert.equal(calls.filter((call) => call.startsWith('ratio:')).length, 1)
  assert.equal(calls.filter((call) => call.startsWith('size:')).length, 1)

  await testRenderer.act(async () => root?.unmount())
  assert.equal(calls.at(-1), 'dispose')
})

test('classic WebGL follows its layout size, DPR, and perspective-camera aspect', async () => {
  const originalObserver = globalThis.ResizeObserver
  const originalRatio = globalThis.devicePixelRatio
  let notifyResize: (() => void) | undefined
  class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      notifyResize = () => callback([], this as unknown as ResizeObserver)
    }
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver
  Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: 2 })
  const scene = new Scene()
  const camera = new PerspectiveCamera(60, 1)
  const bounds = { width: 320, height: 180 }
  const surface = {
    getBoundingClientRect: () => ({ left: 0, top: 0, ...bounds }),
  }
  const sizes: string[] = []
  const observed: string[] = []
  const renderer = {
    dispose: () => undefined,
    render: () => undefined,
    setPixelRatio: (ratio: number) => sizes.push(`ratio:${ratio}`),
    setSize: (width: number, height: number) => sizes.push(`${width}x${height}`),
  } as unknown as WebGLRenderer
  let root: ReturnType<typeof testRenderer.create> | undefined

  try {
    await testRenderer.act(async () => {
      root = testRenderer.create(
        <ThreeCanvas
          decorative
          scene={scene}
          camera={camera}
          style={{ width: '100%', height: '100%' }}
          createRenderer={() => renderer}
          onResize={({ width, height, pixelRatio }) =>
            observed.push(`${width}x${height}@${pixelRatio}`)
          }
        />,
        { createNodeMock: (element) => (element.type === 'canvas' ? surface : null) },
      )
    })
    assert.ok(sizes.includes('320x180'))
    assert.ok(sizes.includes('ratio:2'))
    assert.equal(camera.aspect, 320 / 180)
    assert.equal(observed.at(-1), '320x180@2')

    bounds.width = 600
    bounds.height = 300
    await testRenderer.act(async () => notifyResize?.())
    assert.equal(sizes.at(-1), '600x300')
    assert.equal(camera.aspect, 2)
    assert.equal(observed.at(-1), '600x300@2')
  } finally {
    await testRenderer.act(async () => root?.unmount())
    globalThis.ResizeObserver = originalObserver
    if (originalRatio === undefined) Reflect.deleteProperty(globalThis, 'devicePixelRatio')
    else
      Object.defineProperty(globalThis, 'devicePixelRatio', {
        configurable: true,
        value: originalRatio,
      })
  }
})

test('manual camera resize preserves an application-owned projection', async () => {
  const scene = new Scene()
  const camera = new PerspectiveCamera(60, 3)
  const renderer = {
    dispose: () => undefined,
    render: () => undefined,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
  } as unknown as WebGLRenderer
  let root: ReturnType<typeof testRenderer.create> | undefined
  await testRenderer.act(async () => {
    root = testRenderer.create(
      <ThreeCanvas
        decorative
        scene={scene}
        camera={camera}
        cameraResize="manual"
        width={320}
        height={180}
        createRenderer={() => renderer}
      />,
      { createNodeMock: () => ({}) },
    )
  })
  assert.equal(camera.aspect, 3)
  await testRenderer.act(async () => root?.unmount())
})

test('continuous WebGL frames bypass React scene and control reconstruction', async () => {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  const scheduled = new Map<number, FrameRequestCallback>()
  let requestId = 0
  globalThis.requestAnimationFrame = (callback) => {
    const id = ++requestId
    scheduled.set(id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = (id) => {
    if (id == null) return
    scheduled.delete(id)
  }
  const scene = new Scene()
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  scene.add(mesh)
  const camera = new PerspectiveCamera()
  let renders = 0
  let labels = 0
  const renderer = {
    dispose: () => undefined,
    render: () => {
      renders += 1
    },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
  } as unknown as WebGLRenderer
  let root: ReturnType<typeof testRenderer.create> | undefined

  try {
    await testRenderer.act(async () => {
      root = testRenderer.create(
        <ThreeCanvas
          decorative
          scene={scene}
          camera={camera}
          width={100}
          height={100}
          frameloop="always"
          createRenderer={() => renderer}
          getAccessibilityLabel={() => {
            labels += 1
            return 'Cube'
          }}
          onObjectPress={() => undefined}
        />,
        { createNodeMock: () => ({}) },
      )
    })
    assert.equal(renders, 1)
    assert.equal(labels, 1)

    for (const timestamp of [1000, 1016]) {
      const next = scheduled.entries().next().value as [number, FrameRequestCallback] | undefined
      assert.ok(next)
      scheduled.delete(next[0])
      await testRenderer.act(async () => next[1](timestamp))
    }
    assert.equal(renders, 3)
    assert.equal(labels, 1, 'animation frames rebuilt semantic controls through React')
  } finally {
    await testRenderer.act(async () => root?.unmount())
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  }
})

test('classic WebGL surface preserves labelled, decorative, and fallback semantics', async () => {
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  const renderer = {
    dispose: () => undefined,
    render: () => undefined,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
  } as unknown as WebGLRenderer
  const createRenderer = () => renderer
  let root: ReturnType<typeof testRenderer.create> | undefined

  await testRenderer.act(async () => {
    root = testRenderer.create(
      <ThreeCanvas
        accessibilityLabel="Orbiting globe"
        scene={scene}
        camera={camera}
        width={100}
        height={80}
        createRenderer={createRenderer}
      />,
      { createNodeMock: () => ({}) },
    )
  })
  const canvas = root?.root.findByType('canvas')
  assert.equal(canvas?.props.role, 'img')
  assert.equal(canvas?.props['aria-label'], 'Orbiting globe')

  await testRenderer.act(async () => {
    root?.update(
      <ThreeCanvas
        accessibilityLabel="Data scene"
        accessibleFallback={<p>Data table</p>}
        scene={scene}
        camera={camera}
        width={100}
        height={80}
        createRenderer={createRenderer}
      />,
    )
  })
  assert.equal(root?.root.findByType('canvas').props['aria-hidden'], true)
  const fallback = root?.root.findByType('div')
  assert.equal(fallback?.props.role, 'group')
  assert.equal(fallback?.props['aria-label'], 'Data scene')

  await testRenderer.act(async () => root?.unmount())
})

test('classic WebGL raycasts pointer activation and exposes one semantic control per object', async () => {
  const scene = new Scene()
  const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
  mesh.name = 'Cube'
  scene.add(mesh)
  const camera = new PerspectiveCamera(90, 1, 1, 10)
  camera.position.z = 5
  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  const events: unknown[] = []
  const active: unknown[] = []
  const renderer = {
    dispose: () => undefined,
    render: () => undefined,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
  } as unknown as WebGLRenderer
  const surface = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture: () => undefined,
  }
  let root: ReturnType<typeof testRenderer.create> | undefined

  await testRenderer.act(async () => {
    root = testRenderer.create(
      <ThreeCanvas
        accessibilityLabel="Cube scene"
        scene={scene}
        camera={camera}
        width={100}
        height={100}
        createRenderer={() => renderer}
        onObjectPress={(event) => events.push(event)}
        onObjectActiveChange={(event) => active.push(event)}
      />,
      { createNodeMock: (element) => (element.type === 'canvas' ? surface : null) },
    )
  })

  const button = root?.root.findByType('button')
  assert.ok(button)
  assert.equal(button?.props.children, 'Cube')
  const canvas = root?.root.findByType('canvas')
  assert.ok(canvas)
  const pointer = {
    clientX: 50,
    clientY: 50,
    currentTarget: surface,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse',
  }
  ;(canvas.props.onPointerMove as (event: typeof pointer) => void)(pointer)
  assert.equal((active[0] as { object: unknown }).object, mesh)
  ;(button.props.onFocus as () => void)()
  ;(canvas.props.onPointerLeave as (event: typeof pointer) => void)(pointer)
  assert.equal(active.length, 1, 'pointer leave cleared focus-owned active state')
  ;(button.props.onBlur as () => void)()
  assert.equal(active[1], undefined)
  ;(canvas.props.onPointerDown as (event: typeof pointer) => void)(pointer)
  ;(canvas.props.onPointerUp as (event: typeof pointer) => void)(pointer)
  assert.equal((events[0] as { object: unknown }).object, mesh)

  ;(button.props.onClick as () => void)()
  assert.equal((events[1] as { object: unknown }).object, mesh)
  await testRenderer.act(async () => root?.unmount())
})

test('classic WebGL touch indicates while held and clears on release', async () => {
  const scene = new Scene()
  const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
  mesh.name = 'Cube'
  scene.add(mesh)
  const camera = new PerspectiveCamera(90, 1, 1, 10)
  camera.position.z = 5
  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  const active: unknown[] = []
  const pressed: unknown[] = []
  const captures: number[] = []
  const renderer = {
    dispose: () => undefined,
    render: () => undefined,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
  } as unknown as WebGLRenderer
  const surface = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture: (pointerId: number) => captures.push(pointerId),
  }
  let root: ReturnType<typeof testRenderer.create> | undefined

  await testRenderer.act(async () => {
    root = testRenderer.create(
      <ThreeCanvas
        accessibilityLabel="Cube scene"
        scene={scene}
        camera={camera}
        width={100}
        height={100}
        createRenderer={() => renderer}
        onObjectPress={(event) => pressed.push(event)}
        onObjectActiveChange={(event) => active.push(event)}
      />,
      { createNodeMock: (element) => (element.type === 'canvas' ? surface : null) },
    )
  })

  const canvas = root?.root.findByType('canvas')
  assert.ok(canvas)
  const pointer = {
    button: 0,
    clientX: 50,
    clientY: 50,
    currentTarget: surface,
    isPrimary: true,
    pointerId: 7,
    pointerType: 'touch',
  }
  ;(canvas.props.onPointerDown as (event: typeof pointer) => void)(pointer)
  assert.equal((active[0] as { object: unknown }).object, mesh)
  assert.deepEqual(captures, [7])
  ;(canvas.props.onPointerMove as (event: typeof pointer) => void)(pointer)
  assert.equal(active.length, 1, 'touch pointermove was mistaken for hover')
  ;(canvas.props.onPointerUp as (event: typeof pointer) => void)(pointer)
  assert.equal(active[1], undefined)
  assert.equal((pressed[0] as { object: unknown }).object, mesh)

  const secondary = { ...pointer, button: 2, pointerId: 8, pointerType: 'mouse' }
  ;(canvas.props.onPointerDown as (event: typeof secondary) => void)(secondary)
  ;(canvas.props.onPointerUp as (event: typeof secondary) => void)(secondary)
  assert.equal(pressed.length, 1, 'secondary button activated the object')
  await testRenderer.act(async () => root?.unmount())
})
