// Actual colour driver with controllable RN nodes, not native pixels/timing.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import './native-render.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const { Animated, StyleSheet } = require('react-native')
const { blendColor } = require('@hozo/engine')
const { HozoPressable, HozoText } = require('../../primitives/src/pressable.native.tsx')
const {
  useHozoTextColorTransition,
} = require('../../primitives/src/text-color-transition.native.ts')
const motion = {
  duration: 100,
  delay: 20,
  easing: 'linear',
  colors: true,
  opacity: false,
  transform: false,
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

test('a Text colour prop change retargets without an interaction change or progress reset', () => {
  Animated.__hozoResetTimings()
  let tree: ReturnType<typeof renderer.create>
  const scene = (color) =>
    React.createElement(
      HozoPressable,
      { hozoTransition: motion },
      React.createElement(HozoText, { style: () => ({ color }) }, 'Label'),
    )
  const color = () =>
    StyleSheet.flatten(tree.root.findByType('Text').props.style).color.__animatedInterpolation
  try {
    renderer.act(() => {
      tree = renderer.create(scene('#000000'))
    })
    assert.equal(Animated.__hozoTimings.length, 0)
    renderer.act(() => tree.update(scene('#ff0000')))
    const node = Animated.__hozoTimings[0].value
    renderer.act(() => node.setValue(0.5))
    renderer.act(() => tree.update(scene('#00ff00')))
    assert.deepEqual(color(), {
      inputRange: [0.5, 1.5],
      outputRange: [blendColor('#000000', '#ff0000', 0.5), '#00ff00'],
    })
    assert.equal(node.value, 0.5, 'retargeting must not reset the old live interpolation')
    assert.equal(Animated.__hozoTimings.length, 2)
    assert.equal(Animated.__hozoTimings[1].value === node, true)
    assert.equal(Animated.__hozoTimings[1].config.toValue, 1.5)
    assert.equal(Animated.__hozoTimings[1].config.useNativeDriver, false)
    renderer.act(() => node.setValue(1))
    const visible = blendColor(color().outputRange[0], color().outputRange[1], 0.5)
    renderer.act(() => tree.update(scene('#000000')))
    assert.deepEqual(color(), { inputRange: [1, 2], outputRange: [visible, '#000000'] })
    renderer.act(() => tree.update(scene('#000000')))
    assert.equal(Animated.__hozoTimings.length, 3, 'unchanged target/state must not restart')
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('a colour driver allocates one node/listener and frame progress never rerenders React', () => {
  Animated.__hozoResetTimings()
  let renders = 0,
    allocations = 0
  let tree: ReturnType<typeof renderer.create>
  const Original = Animated.Value
  Animated.Value = class extends Original {
    constructor(value) {
      super(value)
      allocations++
    }
  }
  function Driver({ color }) {
    renders++
    const value = useHozoTextColorTransition(color, 'same-owner', motion)
    return React.createElement('DriverText', { color: value })
  }
  try {
    renderer.act(() => {
      tree = renderer.create(React.createElement(Driver, { color: '#000000' }))
    })
    renderer.act(() => tree.update(React.createElement(Driver, { color: '#ff0000' })))
    const node = Animated.__hozoTimings[0].value
    const baseline = renders
    renderer.act(() => {
      for (let i = 1; i <= 60; i++) node.setValue(i / 100)
    })
    assert.equal(renders, baseline)
    assert.equal(allocations, 1)
    assert.equal(node.listeners.size, 1)
    renderer.act(() => tree.update(React.createElement(Driver, { color: '#00ff00' })))
    assert.equal(allocations, 1)
    renderer.act(() => tree.unmount())
    tree = undefined
    assert.equal(node.listeners.size, 0)
  } finally {
    renderer.act(() => tree?.unmount())
    Animated.Value = Original
  }
})

for (const strict of [false, true]) {
  test(`an abandoned colour target cannot replace the committed range; strict=${strict}`, async () => {
    Animated.__hozoResetTimings()
    let release!: () => void
    let tree: ReturnType<typeof renderer.create>
    let output: { inputRange: number[]; outputRange: string[] } | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const reads = []
    function Block({ hold }) {
      if (hold) throw pending
      return null
    }
    function Driver({ color, hold }) {
      reads.push(color)
      const value = useHozoTextColorTransition(color, color, motion)
      React.useLayoutEffect(() => {
        output = value.__animatedInterpolation
      })
      return React.createElement(
        'DriverText',
        { color: value },
        React.createElement(Block, { hold }),
      )
    }
    const scene = (color, hold = false) =>
      React.createElement(
        strict ? React.StrictMode : React.Fragment,
        null,
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('Pending') },
          React.createElement(Driver, { color, hold }),
        ),
      )
    try {
      await renderer.act(async () => {
        tree = renderer.create(scene('#000000'))
      })
      await renderer.act(async () => tree.update(scene('#ff0000')))
      const node = Animated.__hozoTimings[0].value
      await renderer.act(async () => node.setValue(0.5))
      const committed = output
      await renderer.act(async () => {
        React.startTransition(() => tree.update(scene('#00ff00', true)))
      })
      assert.ok(reads.includes('#00ff00'), 'must actually attempt the speculative target')
      assert.equal(output === committed, true)
      assert.equal(Animated.__hozoTimings.length, 1)
      assert.equal(node.value, 0.5)
      await renderer.act(async () => tree.update(scene('#0000ff')))
      assert.deepEqual(output.outputRange, [blendColor('#000000', '#ff0000', 0.5), '#0000ff'])
      assert.equal(Animated.__hozoTimings.length, 2)
      await renderer.act(async () => {
        release()
        await pending
      })
      assert.equal(output.outputRange[1], '#0000ff')
      assert.equal(Animated.__hozoTimings.length, 2)
    } finally {
      await renderer.act(async () => {
        release()
        tree?.unmount()
      })
    }
  })
}
