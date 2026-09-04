// A press on a label, driven through the Web surface.
//
// `text-hit-test.test.ts` pins where the box goes given metrics. This asks
// the other half: that the surface asks the context for them at all, with
// the font it is about to draw with, and that `Canvas.Text` registers a
// handler to dispatch to. It did neither -- the measurement existed only
// inside the renderer, and the leaf took no `onPress`.

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

/**
 * A canvas element whose `measureText` answers like a browser: half an em
 * per character, ink 0.7em above the baseline and 0.2em below, read off
 * whatever `font` was set last.
 */
function surface() {
  const fonts: string[] = []
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
      return () => undefined
    },
    set(target, property, value) {
      target[property as string] = value
      if (property === 'font') fonts.push(String(value))
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return {
    fonts,
    node: {
      getContext: () => context,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      setPointerCapture: () => undefined,
    },
  }
}

async function press(x: number, y: number) {
  const presses: CanvasPressEvent[] = []
  const { fonts, node } = surface()
  let renderer: ReturnType<typeof testRenderer.create> | undefined
  await testRenderer.act(async () => {
    renderer = testRenderer.create(
      <Canvas width={100} height={100} accessibilityLabel="Sales by month: Jan 4">
        <Canvas.Text
          text="Jan"
          x={10}
          y={50}
          fontSize={20}
          fontWeight="bold"
          onPress={(event) => presses.push(event)}
        />
      </Canvas>,
      { createNodeMock: (element) => (element.type === 'canvas' ? node : null) },
    )
  })
  const canvas = renderer?.root.findByType('canvas')
  assert.ok(canvas)
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
  return { fonts, presses }
}

test('a press on a label reaches its handler', async () => {
  // "Jan" at 20px is 30 wide from x=10, and reaches 14 above the baseline
  // at y=50. (20, 45) is on the glyphs.
  const { presses } = await press(20, 45)
  assert.deepEqual(presses, [{ point: { x: 20, y: 45 }, surfacePoint: { x: 20, y: 45 } }])
})

test('a press beside the label is not a press on it', async () => {
  const { presses } = await press(60, 45)
  assert.deepEqual(presses, [])
})

test('a press below the ink misses, where a font box would have caught it', async () => {
  // This is the objection the refusal was argued from, now answered
  // rather than avoided: 8px under the baseline is inside a 20px font box
  // and outside the ink of a run with no descenders. `actualBoundingBox*`
  // is what makes the difference, so it is what the surface asks for.
  const { presses } = await press(20, 58)
  assert.deepEqual(presses, [])
})

test('the measurement is taken with the font the label is drawn with', async () => {
  // A measurement in the default font is a box of the wrong width, which
  // reads as a miss on the right label. The surface sets `font` before
  // asking, and puts back whatever was there.
  // Behavioural first: 35 is inside the run at 20px (10 to 40) and
  // outside it in the 10px default (10 to 25).
  const near = await press(35, 45)
  assert.equal(near.presses.length, 1)

  const { fonts } = await press(20, 45)
  assert.ok(
    fonts.some((font) => font.includes('bold') && font.includes('20px')),
    `the label was measured without its own font: ${fonts.join(', ')}`,
  )
})
