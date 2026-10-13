// The stand-in must execute RN's child API, without erasing the incoming
// style shape that the generated-output/Animated contract tests inspect.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import './native-render.ts'

const require = createRequire(import.meta.url)
const { createElement } = require('react')
const { act, create } = require('react-test-renderer')
const { Pressable, Text, TextInput, StyleSheet } = require('react-native')

test('the Native stand-in evaluates a Pressable child at rest and preserves its style callback', (t) => {
  const seen: unknown[] = []
  const style = ({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.5 : 1 })
  let root: ReturnType<typeof create>
  act(() => {
    root = create(
      createElement(Pressable, { style }, (state: unknown) => {
        seen.push(state)
        return createElement(TextInput, { autoComplete: 'sms-otp' })
      }),
    )
  })
  t.after(() => act(() => root.unmount()))
  assert.deepEqual(seen, [{ pressed: false }], 'only the state RN actually supplies')
  const host = root.root.findByType('Pressable')
  assert.equal(host.props.style, style, 'do not hide an incorrect Animated style shape')
  assert.equal(StyleSheet.flatten(host.props.style).opacity, 1)
  assert.equal(StyleSheet.flatten(host.props.style({ pressed: true })).opacity, 0.5)
  assert.equal(root.root.findByType('TextInput').props.autoComplete, 'sms-otp')
})

test('the Native stand-in retains static children, style arrays and host event callbacks', (t) => {
  const style = [{ padding: 4 }, { opacity: 0.5 }]
  const calls: unknown[] = []
  const onFocus = (event: unknown) => calls.push(event)
  let root: ReturnType<typeof create>
  act(() => {
    root = create(createElement(Pressable, { style, onFocus }, createElement(Text, null, 'Label')))
  })
  t.after(() => act(() => root.unmount()))
  const host = root.root.findByType('Pressable')
  assert.equal(host.props.style, style)
  assert.equal(host.props.onFocus, onFocus)
  assert.deepEqual(root.root.findByType('Text').children, ['Label'])
  act(() => host.props.onFocus({ nativeEvent: {} }))
  assert.deepEqual(calls, [{ nativeEvent: {} }])
})
