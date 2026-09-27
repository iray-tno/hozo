import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { createRef } from 'react'
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three'

import { ThreeCanvas, type ThreeCanvasHandle } from './webgl.tsx'

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

  await testRenderer.act(async () => root?.unmount())
  assert.equal(calls.at(-1), 'dispose')
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
