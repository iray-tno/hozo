// `WebView` (#160): on the Web, `onMessage` hears its own frame and nothing
// else; on React Native without `react-native-webview`, the address is still
// reachable as a link. The Web half runs its effect under the test renderer
// with a fake window; the Native half against the RN stub.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { Tree } from './native-render.ts'
import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

test('on the Web, a message is delivered only when its source is this frame', () => {
  const { HozoWebView } = require('../../webview/dist/webview.js') as { HozoWebView: unknown }
  const listeners: ((event: unknown) => void)[] = []
  const globals = globalThis as Record<string, unknown>
  const had = 'window' in globals
  const previous = globals.window
  globals.window = {
    addEventListener: (_type: string, listener: (event: unknown) => void) =>
      listeners.push(listener),
    removeEventListener: () => {},
  }
  const ownWindow = {}
  const heard: unknown[] = []
  try {
    let root: ReturnType<typeof renderer.create> | undefined
    renderer.act(() => {
      root = renderer.create(
        react.createElement(HozoWebView, {
          src: 'https://example.com',
          title: 'Embedded',
          onMessage: (message: unknown) => heard.push(message),
        }),
        { createNodeMock: () => ({ contentWindow: ownWindow }) },
      )
    })
    assert.equal(listeners.length, 1)
    const send = (source: unknown, data: unknown) =>
      renderer.act(() => listeners[0]?.({ source, data, origin: 'https://example.com' }))
    send(ownWindow, { paid: true })
    send({}, 'from another frame')
    send(null, 'from nowhere')
    assert.deepEqual(heard, [{ data: { paid: true }, origin: 'https://example.com' }])
    renderer.act(() => root.unmount())
  } finally {
    if (had) globals.window = previous
    else delete globals.window
  }
})

test('on Native without react-native-webview, the address is a named link to the browser', () => {
  const { HozoWebView } = require('../../webview/src/webview.native.tsx') as {
    HozoWebView: unknown
  }
  const opened: string[] = []
  const original = stub.Linking.openURL
  stub.Linking.openURL = async (url: string) => {
    opened.push(url)
  }
  const warn = console.warn
  const warnings: string[] = []
  console.warn = (text: string) => warnings.push(text)
  try {
    let root: ReturnType<typeof renderer.create> | undefined
    renderer.act(() => {
      root = renderer.create(
        react.createElement(HozoWebView, {
          src: 'https://example.com/terms',
          title: 'Terms of service',
        }),
      )
    })
    const [link] = root.root.findAll((node: Tree) => node.type === 'Pressable')
    assert.equal(link.props.accessibilityRole, 'link')
    assert.equal(link.props.accessibilityLabel, 'Terms of service')
    renderer.act(() => (link.props.onPress as () => void)())
    assert.deepEqual(opened, ['https://example.com/terms'])
    assert.ok(
      warnings.some((text) => text.includes('react-native-webview')),
      String(warnings),
    )
    renderer.act(() => root.unmount())
  } finally {
    stub.Linking.openURL = original
    console.warn = warn
  }
})
