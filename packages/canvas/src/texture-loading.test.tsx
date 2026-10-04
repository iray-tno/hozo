import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { Canvas, type CanvasScene } from './index.tsx'

const testRenderer = createRequire(import.meta.url)('react-test-renderer') as {
  act(callback: () => void): Promise<void>
  create(
    node: React.ReactNode,
    options: { createNodeMock(element: { type: unknown }): unknown },
  ): {
    update(node: React.ReactNode): void
    unmount(): void
  }
}
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('tinted Web images request CORS before loading and replace an unreadable cached source', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  const loads: Array<{ source: string; crossOrigin: string | null }> = []
  const images: FakeImage[] = []
  class FakeImage {
    onerror?: () => void
    complete = false
    crossOrigin: string | null = null
    constructor() {
      images.push(this)
    }
    set src(source: string) {
      loads.push({ source, crossOrigin: this.crossOrigin })
    }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage })
  const context = new Proxy({ globalAlpha: 1 } as Record<string, unknown>, {
    get(target, property) {
      return property in target ? target[property as string] : () => {}
    },
    set(target, property, value) {
      target[property as string] = value
      return true
    },
  })
  const canvas = {
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 20, height: 20 }),
  }
  const scene = (tinted: boolean): CanvasScene => [
    {
      kind: 'triangle-mesh',
      props: {
        vertices: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 0, y: 20 },
        ],
        texture: {
          source: 'https://example.com/texture.png',
          coordinates: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
          ...(tinted ? { tint: { r: 0.5, g: 1, b: 1 } } : {}),
        },
      },
    },
  ]
  const view = (tinted: boolean) => {
    const node = scene(tinted)[0]!
    assert.ok(node.kind === 'triangle-mesh')
    return (
      <Canvas decorative width={20} height={20}>
        <Canvas.TriangleMesh {...node.props} />
      </Canvas>
    )
  }
  let renderer: ReturnType<typeof testRenderer.create> | undefined
  try {
    await testRenderer.act(() => {
      renderer = testRenderer.create(view(false), {
        createNodeMock: (element) => (element.type === 'canvas' ? canvas : null),
      })
    })
    await testRenderer.act(() => renderer?.update(view(true)))
    await testRenderer.act(() => images[0]?.onerror?.())
    await testRenderer.act(() => renderer?.update(view(true)))
    assert.deepEqual(loads, [
      { source: 'https://example.com/texture.png', crossOrigin: null },
      { source: 'https://example.com/texture.png', crossOrigin: 'anonymous' },
    ])
  } finally {
    await testRenderer.act(() => renderer?.unmount())
    if (previous) Object.defineProperty(globalThis, 'Image', previous)
    else Reflect.deleteProperty(globalThis, 'Image')
  }
})
