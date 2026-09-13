import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { resolveAnimatedStyle, subscribeAnimatedStyle } from './animated-node.ts'
import { HozoAnimatedView } from './animated-view.ts'

const require = createRequire(import.meta.url)
interface TestInstance {
  type: unknown
  props: Record<string, unknown>
}
interface TestRoot {
  root: { find: (predicate: (node: TestInstance) => boolean) => TestInstance }
  update(element: unknown): void
  unmount(): void
}
const renderer = require('react-test-renderer') as {
  create(element: unknown): TestRoot
  act(callback: () => void): void
}
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('Animated.View resolves Animated-compatible nodes before DOM style normalization', () => {
  const half = {
    __getValue: () => 0.5,
    addListener: () => 'listener',
    removeListener() {},
  }
  const html = renderToStaticMarkup(
    createElement(HozoAnimatedView, {
      style: [{ opacity: half }, { transform: [{ scale: half }] }],
    }),
  )

  assert.match(html, /^<div/)
  assert.match(html, /opacity:0.5/)
  assert.match(html, /transform:scale\(0.5\)/)
  assert.doesNotMatch(html, /__getValue/)
})

test('Animated.View leaves ordinary nested styles alone without diagnostics', () => {
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...parts: unknown[]) => warnings.push(parts)
  try {
    const html = renderToStaticMarkup(
      createElement(HozoAnimatedView, {
        style: [{ opacity: 0.75 }, false, { transform: [{ scale: 2 }] }],
      }),
    )
    assert.match(html, /opacity:0.75/)
    assert.match(html, /transform:scale\(2\)/)
    assert.deepEqual(warnings, [])
  } finally {
    console.warn = originalWarn
  }
})

test('Animated.View omits incompatible nodes and diagnoses each capability failure once', () => {
  const missingGetter = {
    addListener: () => 'missing',
    removeListener() {},
  }
  const throwingGetter = {
    __getValue() {
      throw new Error('fixture failure')
    },
  }
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...parts: unknown[]) => warnings.push(parts.join(' '))
  try {
    const html = renderToStaticMarkup(
      createElement(HozoAnimatedView, {
        style: {
          opacity: missingGetter,
          zIndex: missingGetter,
          width: throwingGetter,
          height: throwingGetter,
        },
      }),
    )
    assert.doesNotMatch(html, /opacity|z-index|width|height/)
    assert.equal(
      warnings.filter((warning) => warning.includes('ANIMATED_GETTER_MISSING')).length,
      1,
    )
    assert.equal(warnings.filter((warning) => warning.includes('ANIMATED_GETTER_FAILED')).length, 1)
    assert.match(warnings.join('\n'), /fixture failure/)
  } finally {
    console.warn = originalWarn
  }
})

test('Animated.View does not retain subscriptions that have no cleanup', () => {
  let additions = 0
  const node = {
    __getValue: () => 1,
    addListener() {
      additions += 1
      return 'leaked'
    },
  }
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...parts: unknown[]) => warnings.push(parts.join(' '))
  try {
    const cleanup = subscribeAnimatedStyle({ opacity: node }, () => {})
    cleanup()
    cleanup()
    assert.equal(additions, 0)
    assert.equal(
      warnings.filter((warning) => warning.includes('ANIMATED_REMOVE_LISTENER_MISSING')).length,
      1,
    )
  } finally {
    console.warn = originalWarn
  }
})

test('Animated.View compatibility diagnostics stay quiet in production', () => {
  const originalEnvironment = process.env.NODE_ENV
  const originalWarn = console.warn
  const warnings: unknown[][] = []
  process.env.NODE_ENV = 'production'
  console.warn = (...parts: unknown[]) => warnings.push(parts)
  try {
    assert.deepEqual(resolveAnimatedStyle({ opacity: { addListener() {} } }), {
      opacity: undefined,
    })
    assert.deepEqual(warnings, [])
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalEnvironment
    console.warn = originalWarn
  }
})

test('Animated.View redraws from listeners and cleans up replacement and unmount subscriptions', () => {
  function animated(initialValue: number) {
    let value = initialValue
    let nextId = 0
    const listeners = new Map<number, () => void>()
    const removed: number[] = []
    return {
      __getValue: () => value,
      addListener(listener: () => void) {
        const id = nextId++
        listeners.set(id, listener)
        return id
      },
      removeListener(id: number) {
        removed.push(id)
        listeners.delete(id)
      },
      set(nextValue: number) {
        value = nextValue
        for (const listener of listeners.values()) listener()
      },
      listenerCount: () => listeners.size,
      removed,
    }
  }

  const first = animated(0.25)
  const second = animated(0.75)
  let root: TestRoot | undefined
  renderer.act(() => {
    root = renderer.create(createElement(HozoAnimatedView, { style: { opacity: first } }))
  })
  const mounted = root as TestRoot
  const div = () => mounted.root.find((node) => node.type === 'div')
  assert.equal((div().props.style as { opacity: number }).opacity, 0.25)
  assert.equal(first.listenerCount(), 1)

  renderer.act(() => first.set(0.5))
  assert.equal((div().props.style as { opacity: number }).opacity, 0.5)

  renderer.act(() => {
    mounted.update(createElement(HozoAnimatedView, { style: { opacity: second } }))
  })
  assert.equal(first.listenerCount(), 0)
  assert.deepEqual(first.removed, [0])
  assert.equal(second.listenerCount(), 1)
  assert.equal((div().props.style as { opacity: number }).opacity, 0.75)

  renderer.act(() => mounted.unmount())
  assert.equal(second.listenerCount(), 0)
  assert.deepEqual(second.removed, [0])
})
