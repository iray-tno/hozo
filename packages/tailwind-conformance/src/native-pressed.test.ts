import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

function style(tree: Tree): Record<string, unknown> {
  return stub.StyleSheet.flatten([tree?.props.style].flat(Infinity))
}

function children(tree: Tree): Tree[] {
  return ((tree?.children ?? []) as (Tree | string)[]).filter(
    (child): child is Tree => typeof child === 'object' && child !== null,
  )
}

for (const primitive of ['Button', 'Pressable', 'Link']) {
  test(`${primitive} press events update raw and explicit text through the same measured owner`, () => {
    const { C } = loadNativeModule(`
      import { ${primitive}, Text } from '@hozo/core'
      export function C(props) {
        return <${primitive} {...props} ${primitive === 'Link' ? 'href="/docs"' : ''} className="@container/main active:text-red-500 not-active:text-blue-500">
          raw<Text className="@sm/main:not-active:opacity-50">explicit</Text>
        </${primitive}>
      }`)
    const ref = react.createRef()
    const nativeHost = { measure: () => {} }
    const calls: string[] = []
    let root: ReturnType<typeof renderer.create> | undefined
    try {
      renderer.act(() => {
        root = renderer.create(
          react.createElement(C, {
            ref,
            onPressIn: () => calls.push('in'),
            onPressOut: () => calls.push('out'),
            onLayout: () => calls.push('layout'),
          }),
          { createNodeMock: () => nativeHost },
        )
      })
      const host = () => root!.root.findByType('Pressable')
      const fire = (name: string, event = { nativeEvent: {} }) =>
        renderer.act(() => host().props[name](event))
      const tree = () => root!.toJSON() as Tree
      const idle = style(children(tree())[0]).color
      assert.ok(idle)
      fire('onLayout', { nativeEvent: { layout: { width: 384, height: 40 } } } as never)
      assert.equal(style(children(tree())[1]).opacity, 0.5)
      for (let round = 0; round < 2; round++) {
        fire('onPressIn')
        assert.notEqual(style(children(tree())[0]).color, idle)
        assert.equal(style(children(tree())[1]).opacity, undefined)
        fire('onPressOut')
        assert.equal(style(children(tree())[0]).color, idle)
        assert.equal(style(children(tree())[1]).opacity, 0.5)
      }
      assert.deepEqual(calls, ['layout', 'in', 'out', 'in', 'out'])
      assert.equal(ref.current, nativeHost, 'measurement and state updates preserve the host')
      assert.equal(root!.root.findAllByType('Pressable').length, 1)
    } finally {
      renderer.act(() => root?.unmount())
    }
    assert.equal(ref.current, null)
  })
}

test('descendant-only not-active reads its nearest owner, not the outer pressed state', () => {
  const { C } = loadNativeModule(`
    import { Pressable, Button, Text } from '@hozo/core'
    export function C() {
      return <Pressable className="active:text-red-500">
        <Button><Text className="text-gray-500 not-active:text-blue-500">inner</Text></Button>
      </Pressable>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    const hosts = () => root!.root.findAllByType('Pressable')
    const text = () => children(children(root!.toJSON() as Tree)[0])[0]
    const idle = style(text()).color
    renderer.act(() => hosts()[0].props.onPressIn({ nativeEvent: {} }))
    assert.equal(style(text()).color, idle)
    renderer.act(() => hosts()[1].props.onPressIn({ nativeEvent: {} }))
    assert.notEqual(style(text()).color, idle)
    renderer.act(() => hosts()[1].props.onPressOut({ nativeEvent: {} }))
    assert.equal(style(text()).color, idle)
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('not-active-only transitions use existing native opacity/transform and JS text drivers', () => {
  const { C } = loadNativeModule(`
    import { Button } from '@hozo/core'
    export function C() {
      return <Button className="opacity-100 scale-100 text-gray-500 transition duration-200 not-active:opacity-50 not-active:scale-95 not-active:text-blue-500">x</Button>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    const host = () => root!.root.findByType('Pressable')
    assert.notEqual(typeof host().props.style, 'function')
    for (const [event, opacity, scale] of [
      ['onPressIn', 1, 1],
      ['onPressOut', 0.5, 0.95],
    ] as const) {
      stub.Animated.__hozoResetTimings()
      renderer.act(() => host().props[event]({ nativeEvent: {} }))
      const configs = stub.Animated.__hozoTimings.map(
        (timing: { config: Record<string, unknown> }) => timing.config,
      )
      assert.ok(
        configs.some(
          (config: Record<string, unknown>) =>
            config.toValue === opacity && config.useNativeDriver === true,
        ),
      )
      assert.ok(
        configs.some(
          (config: Record<string, unknown>) =>
            config.toValue === scale && config.useNativeDriver === true,
        ),
      )
      assert.ok(
        configs.some(
          (config: Record<string, unknown>) =>
            config.duration === 200 && config.useNativeDriver === false,
        ),
      )
    }
  } finally {
    renderer.act(() => root?.unmount())
  }
})
