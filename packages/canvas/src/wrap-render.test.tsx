// `maxWidth` through the Web surface and through the hit test.
//
// `wrap-text.test.ts` pins the rule. This asks what the rule does once a
// renderer is holding it: that a wrapped label is drawn as several runs
// against the context's own widths, that `y` stays the first baseline,
// and that every line can be pressed -- including the second one, which
// is the whole point of hit testing lines rather than the first.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { ReactNode } from 'react'

import { Canvas, type CanvasPressEvent } from './index.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  create: (
    element: unknown,
    options?: { createNodeMock?: (element: { type: string }) => unknown },
  ) => { root: { findByType: (type: string) => { props: Record<string, unknown> } | undefined } }
  act(callback: () => void | Promise<void>): Promise<void>
}

/** A context that measures half an em per character and records its calls. */
function surface() {
  const calls: [string, ...unknown[]][] = []
  const state: Record<string, unknown> = { globalAlpha: 1, font: '10px sans-serif' }
  const context = new Proxy(state, {
    get(target, property) {
      if (property === 'measureText') {
        return (text: string) => {
          const size = Number.parseFloat(/([0-9.]+)px/.exec(String(target.font))?.[1] ?? '') || 10
          return {
            width: text.length * size * 0.5,
            actualBoundingBoxAscent: size * 0.7,
            actualBoundingBoxDescent: size * 0.2,
          }
        }
      }
      if (property in target) return target[property as string]
      return (...args: unknown[]) => calls.push([String(property), ...args])
    },
    set(target, property, value) {
      target[property as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return {
    calls,
    node: {
      getContext: () => context,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
      setPointerCapture: () => undefined,
    },
  }
}

async function mount(children: ReactNode) {
  const { calls, node } = surface()
  let renderer: ReturnType<typeof testRenderer.create> | undefined
  await testRenderer.act(async () => {
    renderer = testRenderer.create(
      <Canvas width={200} height={200} accessibilityLabel="Chart">
        {children}
      </Canvas>,
      { createNodeMock: (element) => (element.type === 'canvas' ? node : null) },
    )
  })
  const canvas = renderer?.root.findByType('canvas')
  assert.ok(canvas)
  const press = (x: number, y: number) => {
    const pointer = {
      button: 0,
      clientX: x,
      clientY: y,
      currentTarget: node,
      isPrimary: true,
      pointerId: 1,
    }
    ;(canvas.props.onPointerDown as (event: typeof pointer) => void)(pointer)
    ;(canvas.props.onPointerUp as (event: typeof pointer) => void)(pointer)
  }
  return { drawn: calls.filter(([name]) => name === 'fillText'), press }
}

// At 20px each character is 10 wide, so 60 holds six of them.
const LABEL = { x: 10, y: 50, fontSize: 20, maxWidth: 60 } as const

test('a label wider than maxWidth is drawn as several runs', async () => {
  const { drawn } = await mount(<Canvas.Text text="Sales are up" {...LABEL} />)
  assert.deepEqual(
    drawn.map(([, text]) => text),
    ['Sales', 'are up'],
  )
})

test('y is the first baseline, and the rest follow by lineHeight', async () => {
  // The single-line case is where `y` already was, so adding `maxWidth`
  // to a label does not move the label.
  const { drawn } = await mount(<Canvas.Text text="Sales are up" {...LABEL} lineHeight={1.5} />)
  assert.deepEqual(
    drawn.map(([, , , y]) => y),
    [50, 80],
  )
})

test('without maxWidth a long label is still one run', async () => {
  // The behaviour every drawing API has, kept for anyone who was relying
  // on it. Wrapping is something asked for, not something that arrives.
  const { drawn } = await mount(<Canvas.Text text="Sales are up" x={10} y={50} fontSize={20} />)
  assert.deepEqual(
    drawn.map(([, text]) => text),
    ['Sales are up'],
  )
})

test('a press on the second line is a press on the label', async () => {
  // The reason the hit test boxes lines rather than the first line: a
  // wrapped label a person can see and press only the top of is worse
  // than one that refuses everywhere.
  const presses: CanvasPressEvent[] = []
  const { press } = await mount(
    <Canvas.Text text="Sales are up" {...LABEL} onPress={(event) => presses.push(event)} />,
  )
  press(20, 45)
  assert.equal(presses.length, 1, 'the first line missed')
  press(20, 69)
  assert.equal(presses.length, 2, 'the second line missed')
})

test('the gap a short line leaves is not pressable', async () => {
  // Each line is boxed on its own. "Sales" is five characters and stops
  // at 60; a press at 65 on that line is past the ink, and answering it
  // would be a target nothing on screen marks.
  const presses: CanvasPressEvent[] = []
  const { press } = await mount(
    <Canvas.Text text="Sales are up" {...LABEL} onPress={(event) => presses.push(event)} />,
  )
  press(65, 45)
  assert.deepEqual(presses, [])
})
