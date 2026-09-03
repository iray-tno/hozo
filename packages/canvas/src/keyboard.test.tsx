// A keyboard reaching a shape on a canvas.
//
// It could not, and the reason was structural rather than missing: a
// canvas is one element and the shapes in it are pixels, so there is
// nothing to focus and nothing to announce. #26 asks for a decision here
// that "does not create invisible controls", and the answer is not to
// invent one -- it is to give each named pressable shape a real
// `<button>` in the visually-hidden layer the surface already has. Real
// focus, real Enter and Space, real accessible name.
//
// Focus moves the active target, so a tooltip written once against
// `onActiveChange` appears for a keyboard exactly as it does for a mouse.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { Canvas, type CanvasPressEvent } from './index.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  create: (
    element: unknown,
    options?: { createNodeMock?: (element: { type: string }) => unknown },
  ) => {
    root: {
      findAllByType: (type: string) => { props: Record<string, unknown> }[]
    }
  }
  act(callback: () => void | Promise<void>): Promise<void>
}

function surface() {
  const context = new Proxy({ globalAlpha: 1 } as Record<string, unknown>, {
    get: (target, property) => (property in target ? target[property as string] : () => undefined),
    set: (target, property, value) => {
      target[property as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return {
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture: () => undefined,
  }
}

async function mount(children: unknown) {
  const canvasNode = surface()
  let renderer: ReturnType<typeof testRenderer.create> | undefined
  await testRenderer.act(async () => {
    renderer = testRenderer.create(
      <Canvas width={100} height={100} accessibilityLabel="Chart">
        {children as never}
      </Canvas>,
      { createNodeMock: (element) => (element.type === 'canvas' ? canvasNode : null) },
    )
  })
  return renderer?.root.findAllByType('button') ?? []
}

test('a named pressable shape becomes a real button', async () => {
  const buttons = await mount(
    <Canvas.Rect
      x={0}
      y={0}
      width={40}
      height={40}
      accessibilityLabel="January revenue"
      onPress={() => undefined}
    />,
  )
  assert.equal(buttons.length, 1)
  assert.equal(buttons[0]?.props.children, 'January revenue')
  assert.equal(buttons[0]?.props.type, 'button')
})

test('activating it presses the shape', async () => {
  const presses: CanvasPressEvent[] = []
  const buttons = await mount(
    <Canvas.Rect
      x={20}
      y={20}
      width={40}
      height={40}
      accessibilityLabel="January"
      onPress={(event) => presses.push(event)}
    />,
  )
  ;(buttons[0]?.props.onClick as () => void)()
  // The shape's middle, because a keyboard has no cursor and the event
  // still has to say where.
  assert.deepEqual(presses, [{ point: { x: 40, y: 40 }, surfacePoint: { x: 40, y: 40 } }])
})

test('focus indicates the shape, and blur stops', async () => {
  const changes: (CanvasPressEvent | undefined)[] = []
  const buttons = await mount(
    <Canvas.Rect
      x={20}
      y={20}
      width={40}
      height={40}
      accessibilityLabel="January"
      onPress={() => undefined}
      onActiveChange={(event) => changes.push(event)}
    />,
  )
  ;(buttons[0]?.props.onFocus as () => void)()
  assert.deepEqual(changes, [{ point: { x: 40, y: 40 }, surfacePoint: { x: 40, y: 40 } }])
  ;(buttons[0]?.props.onBlur as () => void)()
  assert.equal(changes.at(-1), undefined)
})

test('an unnamed pressable shape gets no button, and says so', async () => {
  // The decision #26 asks for. A `<button>` with no accessible name is
  // announced as "button" and is precisely the invisible control this
  // route exists to avoid, so the shape stays pointer-only -- and a
  // silent pointer-only control is the failure being fixed, so it is
  // reported rather than left to be discovered.
  const warnings: string[] = []
  const original = console.warn
  console.warn = (message: string) => warnings.push(message)
  try {
    const buttons = await mount(
      <Canvas.Circle cx={20} cy={20} radius={10} onPress={() => undefined} />,
    )
    assert.equal(buttons.length, 0)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0] ?? '', /accessibilityLabel/)
  } finally {
    console.warn = original
  }
})

test('shapes become controls in the order they were drawn', async () => {
  // Tab order is reading order, so it comes from the scene rather than
  // from whichever handler registered first.
  const buttons = await mount(
    <>
      <Canvas.Rect
        x={0}
        y={0}
        width={10}
        height={10}
        accessibilityLabel="first"
        onPress={() => undefined}
      />
      <Canvas.Group transform={{ translateX: 20 }}>
        <Canvas.Circle
          cx={10}
          cy={10}
          radius={5}
          accessibilityLabel="second"
          onPress={() => undefined}
        />
      </Canvas.Group>
      <Canvas.Rect
        x={60}
        y={0}
        width={10}
        height={10}
        accessibilityLabel="third"
        onPress={() => undefined}
      />
    </>,
  )
  assert.deepEqual(
    buttons.map((button) => button.props.children),
    ['first', 'second', 'third'],
  )
})

test('a shape with no handler is not a control', async () => {
  const buttons = await mount(
    <Canvas.Rect x={0} y={0} width={10} height={10} accessibilityLabel="decoration" />,
  )
  assert.equal(buttons.length, 0)
})
