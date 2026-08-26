import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { Canvas } from './index.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  act(callback: () => void | Promise<void>): Promise<void>
  create(node: React.ReactNode, options: { createNodeMock(element: { type: unknown }): unknown }): {
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
