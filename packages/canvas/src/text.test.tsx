// Canvas text, which a chart cannot draw an axis without.
//
// Driven through the Web surface with a recording context, because what
// matters is which calls the renderer makes and with what -- the pixels
// are Canvas2D's business. The Native surface makes the same decisions
// through Skia, and the two mechanisms differ in exactly one place:
// alignment. Canvas2D is told `textAlign` and aligns against its own
// metrics; Skia has no alignment and is handed a measured `x`. Each
// renderer's metrics are its own, and only its own can agree with what it
// rasterises.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { ReactNode } from 'react'

import { Canvas } from './index.tsx'
import { cssFontShorthand } from './scene.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  create: (
    element: unknown,
    options?: { createNodeMock?: (e: { type: string }) => unknown },
  ) => void
  act(callback: () => void | Promise<void>): Promise<void>
}

/** Records every call and every assignment the renderer makes. */
function recordingSurface() {
  const calls: [string, ...unknown[]][] = []
  const state: Record<string, unknown> = { globalAlpha: 1 }
  const context = new Proxy(state, {
    get: (target, property) =>
      property in target
        ? target[property as string]
        : (...args: unknown[]) => calls.push([String(property), ...args]),
    set: (target, property, value) => {
      target[property as string] = value
      calls.push([`set:${String(property)}`, value])
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return {
    calls,
    node: {
      getContext: () => context,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
      setPointerCapture: () => undefined,
    },
  }
}

async function draw(children: ReactNode) {
  const surface = recordingSurface()
  await testRenderer.act(async () => {
    testRenderer.create(
      <Canvas width={200} height={100} accessibilityLabel="Chart">
        {children}
      </Canvas>,
      { createNodeMock: (element) => (element.type === 'canvas' ? surface.node : null) },
    )
  })
  return surface.calls
}

const find = (calls: [string, ...unknown[]][], name: string) =>
  calls.find(([called]) => called === name)

test('a label is filled at its baseline', async () => {
  const calls = await draw(<Canvas.Text text="Jan" x={10} y={20} fontSize={12} fill="black" />)
  assert.deepEqual(find(calls, 'fillText'), ['fillText', 'Jan', 10, 20])
  // Not stroked: a run with a fill and no stroke is filled only, the same
  // rule every other shape follows.
  assert.equal(find(calls, 'strokeText'), undefined)
})

test('the font reaches the context as the shorthand it takes', async () => {
  const calls = await draw(
    <Canvas.Text
      text="Jan"
      x={0}
      y={0}
      fontSize={14}
      fontFamily="Georgia"
      fontStyle="italic"
      fontWeight="700"
    />,
  )
  assert.deepEqual(find(calls, 'set:font'), ['set:font', 'italic 700 14px Georgia'])
})

test('the defaults are named here rather than left to the platform', async () => {
  // Canvas2D starts at `10px sans-serif`, which is smaller than any label
  // anyone wants -- so `fontSize` is required and the rest are defaulted
  // once, in `textFontSpec`, for both surfaces.
  assert.equal(
    cssFontShorthand({ text: 'x', x: 0, y: 0, fontSize: 16 }),
    'normal normal 16px sans-serif',
  )
})

test('alignment is handed to the renderer, not computed for it', async () => {
  const calls = await draw(
    <Canvas.Text text="Jan" x={50} y={20} fontSize={12} textAlign="center" />,
  )
  assert.deepEqual(find(calls, 'set:textAlign'), ['set:textAlign', 'center'])
  // `x` is untouched: Canvas2D shifts the run itself, against the metrics
  // it will rasterise with.
  assert.deepEqual(find(calls, 'fillText'), ['fillText', 'Jan', 50, 20])
})

test('a stroked label is stroked, and a stroke-only one is not filled', async () => {
  const calls = await draw(
    <Canvas.Text text="Jan" x={0} y={0} fontSize={12} stroke="red" strokeWidth={2} />,
  )
  assert.ok(find(calls, 'strokeText'))
  assert.equal(find(calls, 'fillText'), undefined)
})

test('text refuses presses', async () => {
  // The region is whatever the rasteriser drew, and only the renderers
  // know that. Measuring it in the shared hit test would be a third set
  // of metrics agreeing with neither.
  const { hitTestCanvas } = await import('./hit-test.ts')
  const hit = hitTestCanvas(
    [{ id: 'label', kind: 'text', props: { text: 'Jan', x: 0, y: 0, fontSize: 40 } }],
    { x: 5, y: -5 },
    { width: 100, height: 100 },
    () => true,
  )
  assert.equal(hit, undefined)
})
