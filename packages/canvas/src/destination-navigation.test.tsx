import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { HozoNavigationProvider, type HozoNavigationRequest } from '@hozo/runtime/navigation'

import { Canvas, type CanvasPressEvent } from './index.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  create: (
    element: unknown,
    options?: { createNodeMock?: (element: { type: string }) => unknown },
  ) => {
    root: {
      findByType: (type: string) => { props: Record<string, unknown> }
      findAllByType: (type: string) => { props: Record<string, unknown> }[]
    }
    update: (element: unknown) => void
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

async function mount(onPress?: (event: CanvasPressEvent) => void) {
  const requests: HozoNavigationRequest[] = []
  const canvasNode = surface()
  const scene = (href: string) => (
    <HozoNavigationProvider
      adapter={{
        navigate: (request) => {
          requests.push(request)
          return true
        },
      }}
    >
      <Canvas width={100} height={100} accessibilityLabel="Map">
        <Canvas.Rect
          width={100}
          height={100}
          accessibilityLabel="Open details"
          href={href}
          replace
          onPress={onPress}
        />
      </Canvas>
    </HozoNavigationProvider>
  )
  let renderer: ReturnType<typeof testRenderer.create> | undefined
  await testRenderer.act(async () => {
    renderer = testRenderer.create(scene('/details'), {
      createNodeMock: (element) => (element.type === 'canvas' ? canvasNode : null),
    })
  })
  assert.ok(renderer)
  const mounted = renderer
  const canvas = mounted.root.findByType('canvas')
  const pointer = (button = 0, modifiers: Record<string, boolean> = {}) => ({
    altKey: false,
    button,
    clientX: 50,
    clientY: 50,
    ctrlKey: false,
    currentTarget: canvasNode,
    isPrimary: true,
    metaKey: false,
    pointerId: 1,
    pointerType: 'mouse',
    preventDefault: () => undefined,
    shiftKey: false,
    ...modifiers,
  })
  const press = (event: ReturnType<typeof pointer>) => {
    ;(canvas.props.onPointerDown as (value: typeof event) => void)(event)
    ;(canvas.props.onPointerUp as (value: typeof event) => void)(event)
  }
  const updateHref = async (href: string) => {
    await testRenderer.act(async () => mounted.update(scene(href)))
  }
  return { renderer: mounted, requests, press, pointer, updateHref }
}

test('an href-bearing shape exposes a real link instead of an invisible button', async () => {
  const { renderer } = await mount()
  const links = renderer.root.findAllByType('a')
  assert.equal(renderer.root.findAllByType('button').length, 0)
  assert.equal(links.length, 1)
  assert.equal(links[0]?.props.href, '/details')
  assert.equal(links[0]?.props['data-hozo-navigation-replace'], '')
  assert.equal(links[0]?.props.children, 'Open details')
})

test('changing only href updates the semantic link without redrawing the scene contract', async () => {
  const { renderer, updateHref } = await mount()
  await updateHref('/other')
  assert.equal(renderer.root.findByType('a').props.href, '/other')
})

test('a primary press offers the Canvas destination to the installed router', async () => {
  const { press, pointer, requests } = await mount()
  press(pointer())
  await Promise.resolve()
  assert.deepEqual(requests, [{ href: '/details', replace: true, external: undefined }])
})

test('Ctrl, Command, and middle presses open a new browsing context without routing', async () => {
  const opened: unknown[][] = []
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { open: (...args: unknown[]) => opened.push(args) },
  })
  try {
    const { press, pointer, requests } = await mount()
    press(pointer(0, { ctrlKey: true }))
    press(pointer(0, { metaKey: true }))
    press(pointer(1))
    assert.equal(requests.length, 0)
    assert.deepEqual(opened, [
      ['/details', '_blank', 'noopener,noreferrer'],
      ['/details', '_blank', 'noopener,noreferrer'],
      ['/details', '_blank', 'noopener,noreferrer'],
    ])
  } finally {
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, 'window')
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  }
})

test('an authored handler can retain a modified press for multi-selection', async () => {
  const opened: unknown[][] = []
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { open: (...args: unknown[]) => opened.push(args) },
  })
  try {
    let selected = false
    const { press, pointer, requests } = await mount((event) => {
      if (event.ctrlKey) {
        event.preventDefault()
        selected = true
      }
    })
    press(pointer(0, { ctrlKey: true }))
    assert.equal(selected, true)
    assert.equal(requests.length, 0)
    assert.equal(opened.length, 0)
  } finally {
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, 'window')
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  }
})
