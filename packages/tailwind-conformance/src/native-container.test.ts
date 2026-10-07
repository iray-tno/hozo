import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { loadNativeModule, renderNative, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

function children(tree: Tree): Tree[] {
  return ((tree?.children ?? []) as (Tree | string)[]).filter(
    (child): child is Tree => typeof child === 'object' && child !== null,
  )
}

function style(tree: Tree): Record<string, unknown> {
  const value = tree?.props.style
  // The stub is not RN's Pressable. Only supply RN's pressed argument;
  // hover/focus must come from the actual runtime event handlers.
  return stub.StyleSheet.flatten(
    [typeof value === 'function' ? value({ pressed: false }) : value].flat(Infinity),
  )
}

for (const primitive of ['Button', 'Pressable']) {
  test(`a measured ${primitive} keeps one interactive host, its ref, callbacks and child queries`, () => {
    const { C } = loadNativeModule(`
      import { ${primitive}, Text } from '@hozo/core'
      export function C(props) {
        return <${primitive} {...props} className="@container/main opacity-100 not-@md/main:opacity-25 not-hover:opacity-50 focus:scale-95 focus-visible:bg-red-500 text-gray-500 not-hover:text-blue-500">
          raw
          <Text className="@sm/main:opacity-50 group-hover:underline">explicit</Text>
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
            onPress: () => calls.push('press'),
            onLayout: () => calls.push('layout'),
            onHoverIn: () => calls.push('hover'),
            onFocus: () => calls.push('focus'),
            onBlur: () => calls.push('blur'),
            onPressIn: () => calls.push('pressIn'),
            onPressOut: () => calls.push('pressOut'),
          }),
          { createNodeMock: () => nativeHost },
        )
      })
      const host = () => {
        const matches = root!.root.findAll((node: { type: unknown }) => node.type === 'Pressable')
        assert.equal(matches.length, 1)
        assert.equal(
          root!.root.findAll((node: { type: unknown }) => node.type === 'View').length,
          0,
        )
        return matches[0]
      }
      const fire = (event: string, payload: unknown = { nativeEvent: {} }) =>
        renderer.act(() => host().props[event](payload))
      const measure = (width: number) =>
        fire('onLayout', { nativeEvent: { layout: { width, height: 100 } } })
      const tree = () => root!.toJSON() as Tree
      assert.equal(ref.current, nativeHost)
      if (primitive === 'Button') assert.equal(tree()?.props.accessibilityRole, 'button')
      assert.equal(style(tree()).opacity, 0.5)
      const blue = style(children(tree())[0]).color
      assert.ok(blue)
      assert.equal(style(children(tree())[1]).opacity, undefined)
      measure(383)
      assert.equal(style(children(tree())[1]).opacity, undefined)
      measure(384)
      assert.equal(style(children(tree())[1]).opacity, 0.5)
      assert.equal(style(tree()).opacity, 0.5, 'the measured host cannot query itself')
      fire('onHoverIn')
      assert.equal(style(tree()).opacity, 1)
      assert.notEqual(style(children(tree())[0]).color, blue)
      assert.equal(style(children(tree())[1]).textDecorationLine, 'underline')
      fire('onKeyDown')
      fire('onFocus')
      assert.ok(style(tree()).backgroundColor, 'the preserved owner tracks focus modality')
      assert.deepEqual(style(tree()).transform, [{ scale: 0.95 }])
      fire('onBlur')
      fire('onHoverOut')
      fire('onPressIn')
      fire('onPressOut')
      fire('onPress')
      assert.equal(style(tree()).opacity, 0.5)
      assert.equal(ref.current, nativeHost, 'measurement and interaction do not remount the host')
      assert.deepEqual(calls, [
        'layout',
        'layout',
        'hover',
        'focus',
        'blur',
        'pressIn',
        'pressOut',
        'press',
      ])
    } finally {
      renderer.act(() => root?.unmount())
    }
    assert.equal(ref.current, null)
  })
}

test('container measurement preserves specialized, leaf and animated hosts', () => {
  const { C } = loadNativeModule(`
    import { View, Text, TextInput, Image, ScrollView, FlatList } from '@hozo/core'
    export function C({ changed, scrolled }) {
      return <View>
        <Text className="@container">text</Text>
        <TextInput className="@container" accessibilityLabel="Input" value="input" onChangeText={changed} />
        <Image className="@container" alt="" source={{ uri: 'https://example.com/image.png' }} />
        <ScrollView className="@container" horizontal onScroll={scrolled}><Text>scroll</Text></ScrollView>
        <FlatList className="@container" data={['row']} renderItem={({ item }) => <Text>{item}</Text>} />
        <View className="@container opacity-100 transition-opacity dark:opacity-50"><Text>animated</Text></View>
        <View className="@container animate-pulse"><Text>keyframe</Text></View>
      </View>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  const changed = () => {}
  const scrolled = () => {}
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C, { changed, scrolled }))
    })
    const hosts = children(root!.toJSON())
    assert.deepEqual(
      hosts.map((host) => host?.type),
      ['Text', 'TextInput', 'Image', 'ScrollView', 'FlatList', 'Animated.View', 'Animated.View'],
    )
    assert.equal(hosts[1]?.props.value, 'input')
    assert.equal(hosts[1]?.props.onChangeText, changed)
    assert.equal(hosts[1]?.children, null)
    assert.equal(hosts[2]?.children, null)
    assert.deepEqual(hosts[2]?.props.source, { uri: 'https://example.com/image.png' })
    assert.equal(hosts[3]?.props.horizontal, true)
    assert.equal(hosts[3]?.props.onScroll, scrolled)
    assert.deepEqual(hosts[4]?.props.data, ['row'])
    assert.equal(typeof hosts[4]?.props.renderItem, 'function')
    assert.ok(style(hosts[5]).opacity, 'the ambient animation helper still supplies its values')
    assert.ok(style(hosts[6]).opacity, 'the native keyframe host still supplies its values')
    for (const host of hosts) assert.equal(typeof host?.props.onLayout, 'function')
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('a plain measured Pressable retains RN function children and its cheap style callback', () => {
  const { C } = loadNativeModule(`
    import { Pressable, Text } from '@hozo/core'
    export function C() {
      return <Pressable className="@container active:opacity-50" disabled>
        {({ pressed }) => <Text>{pressed ? 'pressed' : 'idle'}</Text>}
      </Pressable>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    const tree = root!.toJSON() as Tree
    assert.equal(tree?.type, 'Pressable')
    assert.equal(tree?.props.disabled, true)
    assert.equal(
      tree?.props.onHoverIn,
      undefined,
      'measurement alone must not enable interaction tracking',
    )
    assert.equal(typeof tree?.props.style, 'function')
    const renderStyle = tree!.props.style as (state: { pressed: boolean }) => unknown
    assert.equal(
      stub.StyleSheet.flatten([renderStyle({ pressed: true })].flat(Infinity)).opacity,
      0.5,
    )
    // RN, not the container, evaluates this function. A provider inserted
    // into the children slot would hide it from Pressable altogether.
    // JSON omits children, and the string host stub does not execute RN's
    // render prop. Inspect the received host props rather than that JSON.
    const renderChildren = root!.root.findByType('Pressable').props.children as (state: {
      pressed: boolean
    }) => { props: { children: string } }
    assert.equal(typeof renderChildren, 'function')
    assert.equal(renderChildren({ pressed: true }).props.children, 'pressed')
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('a measured destination keeps navigation, cancellation and the link role', async () => {
  const opened: string[] = []
  const previous = stub.Linking.openURL
  stub.Linking.openURL = async (href: string) => {
    opened.push(href)
  }
  try {
    for (const primitive of ['Button', 'Pressable', 'Link']) {
      const tree = renderNative(
        `
        import { ${primitive} } from '@hozo/core'
        export function C() {
          return <${primitive} href="https://example.com/docs" external className="@container">Docs</${primitive}>
        }`,
        'C',
      )
      assert.equal(tree?.type, 'Pressable')
      assert.equal(tree?.props.accessibilityRole, 'link')
      const press = tree!.props.onPress as (event: {
        defaultPrevented: boolean
        nativeEvent: object
      }) => void
      press({ defaultPrevented: true, nativeEvent: {} })
      assert.equal(opened.length, 0)
      press({ defaultPrevented: false, nativeEvent: {} })
      await Promise.resolve()
      assert.deepEqual(opened, ['https://example.com/docs'])
      opened.length = 0
    }
  } finally {
    stub.Linking.openURL = previous
  }
})

test('container measurement keeps the interactive opacity transition on its native driver', () => {
  const { C } = loadNativeModule(`
    import { Button } from '@hozo/core'
    export function C() {
      return <Button className="@container opacity-100 transition-opacity not-hover:opacity-50">Save</Button>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  const before = stub.Animated.__hozoTimings.length
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    const host = root!.root.findAll((node: { type: unknown }) => node.type === 'Pressable')
    assert.equal(host.length, 1)
    assert.notEqual(typeof host[0].props.style, 'function', 'Animated must receive an object style')
    renderer.act(() => host[0].props.onHoverIn({ nativeEvent: {} }))
    const timings = stub.Animated.__hozoTimings.slice(before)
    assert.ok(
      timings.some(
        (timing: { config: { toValue: number; useNativeDriver: boolean } }) =>
          timing.config.toValue === 1 && timing.config.useNativeDriver,
      ),
    )
  } finally {
    renderer.act(() => root?.unmount())
  }
})
