// Actual primitive owners; only RN scheduling/hosts are simulated. Counting
// constructors/listeners catches work which a style-only assertion cannot.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import './native-render.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const { Animated, StyleSheet } = require('react-native')
const { HozoPressable, HozoText } = require('../../primitives/src/pressable.native.tsx')
const motion = { duration: 100, easing: 'linear', opacity: true, transform: true, colors: true }
const flat = (style: unknown) => StyleSheet.flatten(style)

function countAnimations(
  run: (counts: { values: number; listeners: Set<string>; stops: number }) => void,
) {
  const Original = Animated.Value
  const originalTiming = Animated.timing
  const originalParallel = Animated.parallel
  const counts = { values: 0, listeners: new Set<string>(), stops: 0 }
  let sequence = 0
  Animated.Value = class extends Original {
    identity: number
    constructor(value: number) {
      super(value)
      this.identity = sequence++
      counts.values += 1
    }
    addListener(listener: unknown) {
      const id = super.addListener(listener)
      counts.listeners.add(`${this.identity}:${id}`)
      return id
    }
    removeListener(id: string) {
      counts.listeners.delete(`${this.identity}:${id}`)
      super.removeListener(id)
    }
  }
  const track = (animation: { stop: () => void }) => ({
    ...animation,
    stop: () => {
      counts.stops += 1
      animation.stop()
    },
  })
  Animated.timing = (...args: unknown[]) => track(originalTiming(...args))
  Animated.parallel = (...args: unknown[]) => track(originalParallel(...args))
  try {
    run(counts)
  } finally {
    Animated.Value = Original
    Animated.timing = originalTiming
    Animated.parallel = originalParallel
  }
}

test('the lightweight owner preserves static style, refs and caller/native props', () =>
  countAnimations((counts) => {
    const nativeNode = { native: true }
    let currentRef: unknown
    let layouts = 0
    let presses = 0
    const style = [{ padding: 4 }, { opacity: 0.7 }]
    const pointer = () => {}
    let root: ReturnType<typeof renderer.create>
    renderer.act(() => {
      root = renderer.create(
        React.createElement(
          HozoPressable,
          {
            style,
            disabled: true,
            accessibilityRole: 'link',
            testID: 'destination',
            ref: (node: unknown) => {
              currentRef = node
            },
            onLayout: () => {
              layouts += 1
            },
            onPress: () => {
              presses += 1
            },
            onPointerDown: pointer,
          },
          React.createElement(HozoText, { style: { color: 'blue' } }, 'Destination'),
        ),
        { createNodeMock: () => nativeNode },
      )
    })
    try {
      const host = root.root.findByType('Pressable')
      assert.equal(currentRef, nativeNode)
      assert.equal(host.props.testID, 'destination')
      assert.equal(host.props.disabled, true)
      assert.equal(host.props.accessibilityRole, 'link')
      assert.equal(host.props.onPointerDown, pointer, 'no modality inference was requested')
      assert.equal(host.props.style({ pressed: false }), style)
      renderer.act(() => {
        host.props.onLayout({})
        host.props.onPress()
      })
      assert.equal(layouts, 1)
      assert.equal(presses, 1, 'RN, not this stand-in, prevents disabled activation')
      assert.equal(flat(root.root.findByType('Text').props.style).color, 'blue')
      assert.equal(counts.values, 0)
      assert.equal(counts.listeners.size, 0)
    } finally {
      renderer.act(() => root.unmount())
    }
    assert.equal(currentRef, null)
  }))

test('a nested no-transition owner never inherits outer interaction facts', () =>
  countAnimations((counts) => {
    const label = (name: string) =>
      React.createElement(
        HozoText,
        { style: (state: Record<string, boolean>) => ({ color: state.hovered ? 'red' : 'black' }) },
        name,
      )
    let root: ReturnType<typeof renderer.create>
    renderer.act(() => {
      root = renderer.create(
        React.createElement(
          HozoPressable,
          {},
          label('Outer'),
          React.createElement(HozoPressable, {}, label('Inner')),
        ),
      )
    })
    try {
      const hosts = root.root.findAllByType('Pressable')
      renderer.act(() => hosts[0].props.onHoverIn({}))
      const labels = root.root.findAllByType('Text')
      assert.equal(flat(labels[0].props.style).color, 'red')
      assert.equal(flat(labels[1].props.style).color, 'black')
      assert.equal(counts.values, 0)
      assert.equal(counts.listeners.size, 0)
    } finally {
      renderer.act(() => root.unmount())
    }
  }))

test('no-transition Pressable and context Text allocate no animation values or listeners', () =>
  countAnimations((counts) => {
    const callbacks: string[] = []
    const props = {
      hozoFocusVisible: true,
      onHoverIn: () => callbacks.push('hover'),
      onFocus: () => callbacks.push('focus'),
      onPressIn: () => callbacks.push('press'),
      style: (state: Record<string, boolean>) => ({
        opacity: state.pressed ? 0.5 : 1,
        padding: state.hovered ? 8 : 4,
      }),
    }
    const child = React.createElement(
      HozoText,
      {
        style: (state: Record<string, boolean>) => ({
          color: state.hovered ? 'red' : 'black',
          fontWeight: state.focusVisible ? '700' : '400',
        }),
      },
      'Label',
    )
    let root: ReturnType<typeof renderer.create>
    renderer.act(() => {
      root = renderer.create(React.createElement(HozoPressable, props, child))
    })
    const host = () => root.root.findByType('Pressable')
    const label = () => root.root.findByType('Text')
    const event = (name: string) => renderer.act(() => host().props[name]({ nativeEvent: {} }))
    try {
      assert.equal(counts.values, 0, 'ordinary rendering constructed Animated.Value')
      assert.equal(counts.listeners.size, 0)
      event('onHoverIn')
      assert.equal(flat(host().props.style).padding, 8)
      assert.equal(flat(label().props.style).color, 'red')
      event('onFocus')
      assert.equal(flat(label().props.style).fontWeight, '700')
      event('onPointerDown')
      assert.equal(flat(label().props.style).fontWeight, '400')
      event('onKeyDown')
      assert.equal(flat(label().props.style).fontWeight, '700')
      event('onPressIn')
      assert.equal(flat(host().props.style).opacity, 0.5)
      event('onPressOut')
      assert.equal(flat(host().props.style).opacity, 1)
      event('onHoverOut')
      assert.equal(flat(label().props.style).color, 'black')
      renderer.act(() => root.update(React.createElement(HozoPressable, props, child)))
      assert.deepEqual(callbacks, ['hover', 'focus', 'press'])
      assert.equal(counts.values, 0, 'updates/interactions constructed animation values')
      assert.equal(counts.listeners.size, 0)
    } finally {
      renderer.act(() => root.unmount())
    }
  }))

test('transition presence changes retain owner state, animate synchronously and release listeners', () =>
  countAnimations((counts) => {
    const props = {
      hozoFocusVisible: true,
      style: (state: Record<string, boolean>) => ({
        opacity: state.hovered ? 0.4 : 1,
        backgroundColor: state.hovered ? '#f00' : '#000',
        transform: [{ scale: state.pressed ? 0.9 : 1 }],
      }),
    }
    const child = React.createElement(
      HozoText,
      { style: (state: Record<string, boolean>) => ({ color: state.hovered ? '#f00' : '#000' }) },
      'Label',
    )
    let root: ReturnType<typeof renderer.create>
    const update = (hozoTransition?: unknown) =>
      renderer.act(() => {
        const element = React.createElement(HozoPressable, { ...props, hozoTransition }, child)
        if (root) root.update(element)
        else root = renderer.create(element)
      })
    const host = () => root.root.findByType('Pressable')
    try {
      update()
      renderer.act(() => host().props.onHoverIn({}))
      assert.equal(flat(host().props.style).opacity, 0.4)
      update(motion)
      assert.ok(counts.values > 0)
      assert.ok(counts.listeners.size > 0)
      assert.equal(
        flat(host().props.style).opacity.value,
        0.4,
        'enabling motion lost the existing hover look',
      )
      Animated.__hozoResetTimings()
      let clientSawAnimation = false
      renderer.act(() =>
        root.update(
          React.createElement(
            HozoPressable,
            {
              ...props,
              hozoTransition: motion,
              onHoverOut: () => {
                clientSawAnimation = Animated.__hozoTimings.length > 0
              },
            },
            child,
          ),
        ),
      )
      renderer.act(() => host().props.onHoverOut({}))
      assert.equal(clientSawAnimation, true, 'animation driver must run before the caller event')
      renderer.act(() => host().props.onHoverIn({}))
      update()
      assert.equal(flat(host().props.style).opacity, 0.4, 'removing motion lost hover')
      assert.equal(flat(root.root.findByType('Text').props.style).color, '#f00')
      assert.equal(counts.listeners.size, 0, 'removing motion retained a progress listener')
      assert.ok(counts.stops >= 2, 'removing motion did not stop the box and text drivers')
      const valuesAfterMotion = counts.values
      renderer.act(() => host().props.onPressIn({}))
      assert.equal(flat(host().props.style).transform[0].scale, 0.9)
      assert.equal(counts.values, valuesAfterMotion)
    } finally {
      renderer.act(() => root.unmount())
    }
    assert.equal(counts.listeners.size, 0)
  }))
