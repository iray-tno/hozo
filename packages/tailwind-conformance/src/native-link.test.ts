import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { HozoNavigationProvider } from '@hozo/engine/navigation'
import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

function style(tree: Tree): Record<string, unknown> {
  const value = tree?.props.style
  return stub.StyleSheet.flatten(
    [typeof value === 'function' ? value({ pressed: false }) : value].flat(Infinity),
  )
}

function children(tree: Tree): Tree[] {
  return ((tree?.children ?? []) as (Tree | string)[]).filter(
    (child): child is Tree => typeof child === 'object' && child !== null,
  )
}

for (const primitive of ['Link', 'Button', 'Pressable']) {
  test(`${primitive} href preserves link semantics, navigation and measured interaction state`, async () => {
    const { C } = loadNativeModule(`
      import { ${primitive}, Text } from '@hozo/core'
      export function C(props) {
        return <${primitive} {...props} href="/docs" prefetch replace className="@container/main opacity-100 not-hover:opacity-50 focus:scale-95 focus-visible:bg-red-500 text-gray-500 not-hover:text-blue-500">
          raw
          <Text className="@sm/main:opacity-50 group-hover:underline">explicit</Text>
        </${primitive}>
      }`)
    const calls: string[] = []
    const ref = react.createRef()
    const nativeHost = { measure: () => {} }
    const adapter = {
      prefetch: (request: { href: string; replace: boolean }) => {
        assert.deepEqual(request, { href: '/docs', replace: true, external: undefined })
        calls.push('prefetch')
      },
      navigate: (request: { href: string; replace: boolean }) => {
        assert.deepEqual(request, { href: '/docs', replace: true, external: undefined })
        calls.push('navigate')
        return true
      },
    }
    let cancel = true
    let root: ReturnType<typeof renderer.create> | undefined
    try {
      renderer.act(() => {
        root = renderer.create(
          react.createElement(
            HozoNavigationProvider,
            { adapter },
            react.createElement(C, {
              ref,
              onLayout: () => calls.push('layout'),
              onHoverIn: () => calls.push('hover'),
              onFocus: () => calls.push('focus'),
              onPressIn: () => calls.push('pressIn'),
              onPress: (event: { defaultPrevented: boolean }) => {
                calls.push('press')
                event.defaultPrevented = cancel
              },
            }),
          ),
          { createNodeMock: () => nativeHost },
        )
      })
      const tree = () => root!.toJSON() as Tree
      const fire = (name: string, event = { nativeEvent: {} }) =>
        renderer.act(() => {
          const host = root!.root.findByType('Pressable')
          host.props[name](event)
        })
      assert.equal(root!.root.findAllByType('Pressable').length, 1)
      assert.equal(tree()?.props.accessibilityRole, 'link')
      assert.equal(ref.current, nativeHost)
      const idleColor = style(children(tree())[0]).color
      assert.equal(style(tree()).opacity, 0.5)
      fire('onLayout', { nativeEvent: { layout: { width: 384, height: 40 } } } as never)
      assert.equal(style(children(tree())[1]).opacity, 0.5)
      fire('onHoverIn')
      assert.equal(style(tree()).opacity, 1)
      assert.notEqual(style(children(tree())[0]).color, idleColor)
      assert.equal(style(children(tree())[1]).textDecorationLine, 'underline')
      fire('onKeyDown')
      fire('onFocus')
      assert.ok(style(tree()).backgroundColor)
      assert.deepEqual(style(tree()).transform, [{ scale: 0.95 }])
      fire('onPointerDown')
      assert.equal(style(tree()).backgroundColor, undefined)
      fire('onPressIn')
      fire('onPressOut')
      fire('onPressIn')
      fire('onPressOut')
      fire('onPress')
      await Promise.resolve()
      assert.equal(calls.includes('navigate'), false, 'author cancellation runs before navigation')
      cancel = false
      fire('onPress')
      await Promise.resolve()
      assert.deepEqual(calls, [
        'layout',
        'hover',
        'focus',
        'pressIn',
        'prefetch',
        'pressIn',
        'press',
        'press',
        'navigate',
      ])
      assert.equal(ref.current, nativeHost, 'events and measurement do not remount the native host')
    } finally {
      renderer.act(() => root?.unmount())
    }
    assert.equal(ref.current, null)
  })
}

test('a descendant-only Link owns text state rather than borrowing an outer Pressable', () => {
  const { C } = loadNativeModule(`
    import { Pressable, Link, Text } from '@hozo/core'
    export function C() {
      return <Pressable className="hover:opacity-50">
        <Link href="/docs"><Text className="text-gray-500 hover:text-blue-500 not-focus-visible:opacity-50">Docs</Text></Link>
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
    renderer.act(() => hosts()[0].props.onHoverIn({ nativeEvent: {} }))
    assert.equal(style(text()).color, idle)
    renderer.act(() => hosts()[1].props.onHoverIn({ nativeEvent: {} }))
    assert.notEqual(style(text()).color, idle)
    renderer.act(() => hosts()[1].props.onKeyDown({ nativeEvent: {} }))
    renderer.act(() => hosts()[1].props.onFocus({ nativeEvent: {} }))
    assert.equal(style(text()).opacity, undefined)
    renderer.act(() => hosts()[1].props.onPointerDown({ nativeEvent: {} }))
    assert.equal(style(text()).opacity, 0.5)
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('Link transitions use the existing drivers and focus-visible text colour tracks modality changes', () => {
  const { C } = loadNativeModule(`
    import { Link } from '@hozo/core'
    export function C() {
      return <Link href="/docs" className="opacity-100 text-gray-500 transition duration-200 hover:opacity-50 hover:scale-95 focus-visible:text-blue-500">Docs</Link>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    const host = () => root!.root.findByType('Pressable')
    assert.notEqual(typeof host().props.style, 'function', 'Animated must receive an object style')
    stub.Animated.__hozoResetTimings()
    renderer.act(() => host().props.onHoverIn({ nativeEvent: {} }))
    assert.ok(
      stub.Animated.__hozoTimings.some(
        (timing: { config: { toValue: number; useNativeDriver: boolean } }) =>
          timing.config.toValue === 0.5 && timing.config.useNativeDriver,
      ),
    )
    assert.ok(
      stub.Animated.__hozoTimings.some(
        (timing: { config: { toValue: number; useNativeDriver: boolean } }) =>
          timing.config.toValue === 0.95 && timing.config.useNativeDriver,
      ),
    )
    renderer.act(() => host().props.onKeyDown({ nativeEvent: {} }))
    renderer.act(() => host().props.onFocus({ nativeEvent: {} }))
    stub.Animated.__hozoResetTimings()
    // Focus stays true: only modality changes. HozoText must still schedule
    // the colour transition rather than comparing focused/hovered alone.
    renderer.act(() => host().props.onPointerDown({ nativeEvent: {} }))
    assert.equal(
      stub.Animated.__hozoTimings.filter(
        (timing: { config: { duration: number; useNativeDriver: boolean } }) =>
          timing.config.duration === 200 && !timing.config.useNativeDriver,
      ).length,
      2,
      'the owner and its inherited text each schedule their colour driver',
    )
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('Link stacked predicates observe disabled and hover in the same owner callback', () => {
  const { C } = loadNativeModule(`
    import { Link } from '@hozo/core'
    export function C({ disabled }) {
      return <Link href="/docs" disabled={disabled} className="opacity-100 hover:not-disabled:opacity-50">Docs</Link>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C, { disabled: false }))
    })
    assert.equal(style(root!.toJSON()).opacity, 1)
    renderer.act(() => root!.root.findByType('Pressable').props.onHoverIn({ nativeEvent: {} }))
    assert.equal(style(root!.toJSON()).opacity, 0.5)
    renderer.act(() => root!.update(react.createElement(C, { disabled: true })))
    assert.equal(style(root!.toJSON()).opacity, 1)
    assert.equal((root!.toJSON() as Tree)?.props.disabled, true)
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('plain Link retains function children, pressed-only host styles, disabled and external navigation', async () => {
  const { C } = loadNativeModule(`
    import { Link, Text } from '@hozo/core'
    export function C(props) {
      return <Link {...props} href="https://example.com" external prefetch className="active:opacity-50">
        {({ pressed }) => <Text>{pressed ? 'pressed' : 'idle'}</Text>}
      </Link>
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  const previous = stub.Linking.openURL
  const opened: string[] = []
  stub.Linking.openURL = async (href: string) => {
    opened.push(href)
  }
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C, { disabled: true }))
    })
    const host = () => root!.root.findByType('Pressable')
    assert.equal(host().props.disabled, true)
    assert.equal(host().props.onHoverIn, undefined)
    assert.equal(host().props.onFocus, undefined)
    assert.equal(host().props.children({ pressed: true }).props.children, 'pressed')
    assert.equal(stub.StyleSheet.flatten(host().props.style({ pressed: true })).opacity, 0.5)
    renderer.act(() => {
      root!.update(react.createElement(C, { disabled: false }))
    })
    renderer.act(() => host().props.onPress({ defaultPrevented: false, nativeEvent: {} }))
    await Promise.resolve()
    assert.deepEqual(opened, ['https://example.com'])
  } finally {
    stub.Linking.openURL = previous
    renderer.act(() => root?.unmount())
  }
})
