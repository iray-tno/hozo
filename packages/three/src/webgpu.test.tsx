import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { PerspectiveCamera, Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'

import { ThreeCanvas } from './webgpu.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  act(callback: () => void | Promise<void>): Promise<void>
  create(
    node: React.ReactNode,
    options: { createNodeMock(element: { type: unknown }): unknown },
  ): { unmount(): void; update(node: React.ReactNode): void }
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('modern renderer initializes before its first draw and preserves forced WebGL options', async () => {
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  const canvas = { kind: 'canvas' }
  const calls: string[] = []
  const renderer = {
    dispose: () => calls.push('dispose'),
    init: async () => {
      calls.push('init')
      return renderer
    },
    render: async () => {
      calls.push('render')
    },
    setPixelRatio: (ratio: number) => calls.push(`ratio:${ratio}`),
    setSize: (width: number, height: number, updateStyle: boolean) =>
      calls.push(`size:${width}x${height}:${updateStyle}`),
  } as unknown as WebGPURenderer
  let root: ReturnType<typeof testRenderer.create> | undefined

  await testRenderer.act(async () => {
    root = testRenderer.create(
      <ThreeCanvas
        decorative
        scene={scene}
        camera={camera}
        width={320}
        height={180}
        pixelRatio={2}
        rendererOptions={{ forceWebGL: true }}
        createRenderer={(node, options) => {
          assert.equal(node, canvas)
          assert.equal(options.forceWebGL, true)
          calls.push('create')
          return renderer
        }}
        onCreated={() => calls.push('created')}
      />,
      { createNodeMock: (element) => (element.type === 'canvas' ? canvas : null) },
    )
  })

  assert.deepEqual(calls.slice(0, 6), [
    'create',
    'init',
    'created',
    'ratio:2',
    'size:320x180:false',
    'render',
  ])
  await testRenderer.act(async () => root?.unmount())
  assert.equal(calls.at(-1), 'dispose')
})

test('modern renderer initialization failures are reported without drawing', async () => {
  const errors: unknown[] = []
  let disposed = false
  const renderer = {
    dispose: () => {
      disposed = true
    },
    init: async () => {
      throw new Error('adapter initialization failed')
    },
    render: () => assert.fail('rendered before successful initialization'),
    setPixelRatio: () => undefined,
    setSize: () => undefined,
  } as unknown as WebGPURenderer
  let root: ReturnType<typeof testRenderer.create> | undefined

  await testRenderer.act(async () => {
    root = testRenderer.create(
      <ThreeCanvas
        decorative
        scene={new Scene()}
        camera={new PerspectiveCamera()}
        width={100}
        height={100}
        createRenderer={() => renderer}
        onError={(error) => errors.push(error)}
      />,
      { createNodeMock: () => ({}) },
    )
  })

  assert.equal((errors[0] as Error).message, 'adapter initialization failed')
  assert.equal(disposed, true)
  await testRenderer.act(async () => root?.unmount())
})

test('modern async draws coalesce and never continue after disposal', async () => {
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  const completions: Array<() => void> = []
  let renders = 0
  let disposed = false
  const renderer = {
    dispose: () => {
      disposed = true
    },
    init: async () => renderer,
    render: () => {
      renders += 1
      return new Promise<void>((resolve) => completions.push(resolve))
    },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
  } as unknown as WebGPURenderer
  const createRenderer = () => renderer
  const surface = (revision: number) => (
    <ThreeCanvas
      decorative
      scene={scene}
      camera={camera}
      width={100}
      height={100}
      revision={revision}
      createRenderer={createRenderer}
    />
  )
  let root: ReturnType<typeof testRenderer.create> | undefined

  await testRenderer.act(async () => {
    root = testRenderer.create(surface(0), { createNodeMock: () => ({}) })
  })
  assert.equal(renders, 1)

  await testRenderer.act(async () => root?.update(surface(1)))
  await testRenderer.act(async () => root?.update(surface(2)))
  assert.equal(renders, 1, 'overlapped async renderer draws')

  await testRenderer.act(async () => {
    completions[0]?.()
    await Promise.resolve()
  })
  assert.equal(renders, 2, 'did not draw the latest coalesced invalidation')

  await testRenderer.act(async () => root?.update(surface(3)))
  await testRenderer.act(async () => root?.unmount())
  assert.equal(disposed, true)
  completions[1]?.()
  await Promise.resolve()
  assert.equal(renders, 2, 'continued a queued draw after renderer disposal')
})
