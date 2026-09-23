import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { createRef } from 'react'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
} from 'three'

import { ThreeCanvas, type ThreeCanvasHandle } from './three-canvas.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  act(callback: () => void | Promise<void>): Promise<void>
  create(
    node: React.ReactNode,
    options: { createNodeMock(element: { type: unknown }): unknown },
  ): { unmount(): void }
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function triangleScene() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3))
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: '#2563eb' }))
  const scene = new Scene()
  scene.add(mesh)
  const camera = new PerspectiveCamera(90, 1, 1, 10)
  camera.position.z = 5
  return { camera, mesh, scene }
}

function recordingSurface(paths: string[]) {
  class RecordedPath {
    constructor(path: string) {
      paths.push(path)
    }
  }
  ;(globalThis as { Path2D?: typeof Path2D }).Path2D = RecordedPath as unknown as typeof Path2D
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
  }
}

test('ThreeCanvas draws a projected Three scene and invalidates imperative mutations', async () => {
  const { camera, mesh, scene } = triangleScene()
  const paths: string[] = []
  const handle = createRef<ThreeCanvasHandle>()
  let renderer: ReturnType<typeof testRenderer.create> | undefined

  await testRenderer.act(async () => {
    renderer = testRenderer.create(
      <ThreeCanvas
        ref={handle}
        decorative
        scene={scene}
        camera={camera}
        width={100}
        height={100}
      />,
      { createNodeMock: (element) => (element.type === 'canvas' ? recordingSurface(paths) : null) },
    )
  })
  assert.equal(paths.at(-1), 'M 40 60 L 60 60 L 50 40 Z')

  mesh.position.x = 1
  await testRenderer.act(async () => handle.current?.invalidate())
  assert.equal(paths.at(-1), 'M 50 60 L 70 60 L 60 40 Z')

  await testRenderer.act(async () => renderer?.unmount())
})

test('the continuous loop updates before projecting and stops on unmount', async () => {
  const { camera, mesh, scene } = triangleScene()
  const paths: string[] = []
  const scheduled = new Map<number, FrameRequestCallback>()
  const cancelled: number[] = []
  let nextRequest = 1
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextRequest++
    scheduled.set(id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = (id) => {
    cancelled.push(id)
    scheduled.delete(id)
  }
  let frames = 0
  let renderer: ReturnType<typeof testRenderer.create> | undefined

  try {
    await testRenderer.act(async () => {
      renderer = testRenderer.create(
        <ThreeCanvas
          decorative
          scene={scene}
          camera={camera}
          width={100}
          height={100}
          frameloop="always"
          onFrame={() => {
            frames += 1
            mesh.position.x = 1
          }}
        />,
        {
          createNodeMock: (element) => (element.type === 'canvas' ? recordingSurface(paths) : null),
        },
      )
    })
    const first = scheduled.entries().next().value as [number, FrameRequestCallback] | undefined
    assert.ok(first)
    scheduled.delete(first[0])
    await testRenderer.act(async () => first[1](1000))

    assert.equal(frames, 1)
    assert.equal(paths.at(-1), 'M 50 60 L 70 60 L 60 40 Z')
    await testRenderer.act(async () => renderer?.unmount())
    assert.equal(cancelled.length, 1)
  } finally {
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  }
})
