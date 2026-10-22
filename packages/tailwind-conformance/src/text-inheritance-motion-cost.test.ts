// Source-backed topology/update counts, not Native pixels or wall-clock speed.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { createCompiler } from '../../compiler/src/index.ts'
import type { HozoPressableProps } from '../../primitives/src/pressable.native.tsx'
import {
  flattenRuntimeStyle as flatten,
  loadTextInheritanceRuntime,
} from './text-inheritance-runtime-host.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function ownerProps(motion: boolean, inherited: boolean) {
  const classes = `text-[#000000] text-[20px] hover:text-[#ff0000] bg-[#ffffff] ${motion ? 'hover:bg-[#000000] transition-colors duration-100 delay-20 ease-linear' : ''}`
  const source = `import {Button} from '@hozo/core';export const Scene=({children})=><Button className="${classes}">{children}</Button>`
  const compiled = createCompiler().compileNativeModule(source, undefined, undefined, {
    textInheritance: inherited,
  }).components[0]
  assert.ok(!compiled.diagnostics.some((entry) => entry.severity === 'error'))
  assert.match(compiled.jsx, inherited ? /HozoInheritedPressable/ : /HozoPressable/)
  // Read the actual compiler callback, not handwritten colour/state targets.
  const js = transformSync(`export const props = ${compiled.jsx}`, {
    loader: 'tsx',
    jsxFactory: 'h',
    format: 'cjs',
  }).code
  const module = { exports: {} }
  runInNewContext(js, {
    module,
    exports: module.exports,
    children: null,
    HozoInheritedPressable: 'owner',
    HozoPressable: 'owner',
    h: (_type, props) => props,
    hozoStyles: runInNewContext(`(${compiled.styles})`),
  })
  return (module.exports as { props: HozoPressableProps }).props
}

function measure(count: number, inherited: boolean, motion: boolean) {
  const counts = { hostRenders: 0, resolutions: 0, frameNotifications: 0, paintReads: 0 }
  const api = loadTextInheritanceRuntime(
    React.createContext(14),
    {
      View: 'NativeView',
      Text(props) {
        counts.hostRenders++
        return React.createElement('NativeText', props)
      },
    },
    true,
  )
  const props = ownerProps(motion, inherited)
  const resolve = props.hozoTextStyle!
  const labelStyle = (state) => {
    counts.resolutions++
    return resolve(state)
  }
  const Animated = api.native.Animated
  const Original = Animated.Value
  const nodes = []
  Animated.Value = class extends Original {
    constructor(value) {
      super(value)
      nodes.push(this)
    }
    addListener(listener) {
      return super.addListener((event) => {
        counts.frameNotifications++
        listener(event)
      })
    }
  }
  Animated.__hozoResetTimings()
  const Text = inherited ? api.HozoInheritedText : api.HozoText
  const View = inherited ? api.HozoInheritedView : api.native.View
  function PaintReader() {
    React.useContext(api.HozoInheritedPaintContext)
    counts.paintReads++
    return null
  }
  const Label = React.memo(({ id, own }) => {
    const [token] = React.useState(() => id)
    return React.createElement(
      View,
      null,
      React.createElement(
        Text,
        {
          testID: id,
          nativeID: token,
          style: inherited ? own : (state) => [labelStyle(state), own],
        },
        'Label',
        React.createElement(PaintReader),
      ),
    )
  })
  const Owner = inherited ? api.HozoInheritedPressable : api.HozoPressable
  let length = count
  let own: { color: string } | undefined
  let tree: ReturnType<typeof renderer.create>
  const scene = () =>
    React.createElement(
      Owner,
      {
        ...props,
        // The ordinary control explicitly forwards the compiler's resolved label
        // callback to opaque leaves. Normal lowering does not do that automatically;
        // comparing a broken ordinary label would not be an equivalent control.
        hozoTextStyle: inherited ? labelStyle : undefined,
      },
      Array.from({ length }, (_, id) =>
        React.createElement(Label, {
          key: id,
          id: `label-${id}`,
          own: id === 0 ? own : undefined,
        }),
      ),
    )
  const labels = () => tree.root.findAllByType('NativeText')
  const owner = () => tree.root.findAllByType('Pressable')[0]
  const listeners = () => nodes.filter((node) => node.listeners.size > 0)
  const target = (node) => {
    const color = flatten(node.props.style).color
    return typeof color === 'string' ? color : color.__animatedInterpolation.outputRange.at(-1)
  }
  const check = (color: string) => {
    assert.equal(labels().length, length)
    assert.equal(tree.root.findAllByType('Pressable').length, 1)
    assert.equal(tree.root.findAllByType('NativeView').length, length)
    for (const [id, node] of labels().entries()) {
      assert.equal(target(node), id === 0 && own ? own.color : color)
      assert.equal(flatten(node.props.style).fontSize, 20)
    }
  }
  try {
    renderer.act(() => {
      tree = renderer.create(scene())
    })
    check('#000000')
    const first = labels()[0]
    const mount = { allocations: nodes.length, listeners: listeners().length, ...counts }
    renderer.act(() => owner().props.onHoverIn({}))
    check('#ff0000')
    const beforeFrames = { ...counts, allocations: nodes.length, listeners: listeners().length },
      allocated = nodes.length
    renderer.act(() => {
      for (let i = 1; i <= 60; i++) for (const node of listeners()) node.setValue(i / 120)
    })
    assert.equal(counts.hostRenders, beforeFrames.hostRenders)
    assert.equal(counts.resolutions, beforeFrames.resolutions)
    assert.equal(counts.paintReads, beforeFrames.paintReads)
    assert.equal(nodes.length, allocated)
    const frameNotifications = counts.frameNotifications - beforeFrames.frameNotifications
    const progressListeners = listeners().length
    length++
    renderer.act(() => tree.update(scene()))
    check('#ff0000')
    assert.equal(listeners().length, motion ? (inherited ? 2 : length + 1) : 0)
    own = { color: '#00ff00' }
    renderer.act(() => tree.update(scene()))
    check('#ff0000')
    renderer.act(() => owner().props.onHoverOut({}))
    check('#000000')
    own = undefined
    renderer.act(() => tree.update(scene()))
    check('#000000')
    assert.equal(labels()[0] === first, true)
    assert.equal(progressListeners, motion ? (inherited ? 2 : count + 1) : 0)
    assert.equal(frameNotifications, progressListeners * 60)
    return {
      labels: count,
      inherited,
      motion,
      mount,
      afterHover: beforeFrames,
      progressListeners,
      frameNotifications,
    }
  } finally {
    renderer.act(() => tree?.unmount())
    assert.ok(nodes.every((node) => node.listeners.size === 0))
    Animated.Value = Original
  }
}

test('shared motion topology stays constant across opaque label fanout without per-frame React work', (t) => {
  for (const count of [1, 32, 128]) {
    const control = measure(count, false, true)
    const shared = measure(count, true, true)
    assert.equal(control.mount.allocations, count + 2)
    assert.equal(shared.mount.allocations, 3)
    assert.equal(control.mount.resolutions, count)
    assert.equal(shared.mount.resolutions, 1)
    assert.equal(control.afterHover.hostRenders, count * 3)
    assert.equal(shared.afterHover.hostRenders, count * 3)
    assert.equal(control.afterHover.resolutions, count * 2)
    assert.equal(shared.afterHover.resolutions, 2)
    assert.equal(control.afterHover.allocations, count + 4)
    assert.equal(shared.afterHover.allocations, 5)
    t.diagnostic(JSON.stringify({ control, shared }))
  }
  for (const inherited of [false, true]) {
    const idle = measure(32, inherited, false)
    assert.equal(idle.mount.allocations, 0)
    assert.equal(idle.progressListeners, 0)
    t.diagnostic(JSON.stringify(idle))
  }
})
