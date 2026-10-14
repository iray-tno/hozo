import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const { compileNative } = require('@hozo/compiler')
const flat = (node: Tree) => stub.StyleSheet.flatten(node.props.style)
const SOURCE = `
import { TextInput } from '@hozo/core'
export function C({ inputRef, onFocus, onBlur, onPressIn, onChangeText, style, editable, multiline }) {
  return <TextInput ref={inputRef} onFocus={onFocus} onBlur={onBlur} onPressIn={onPressIn}
    onChangeText={onChangeText} editable={editable} multiline={multiline} value="Hi"
    accessibilityLabel="Field" placeholder="Name"
    className="px-2 text-red-500 text-sm border focus:text-blue-500 focus-visible:outline-4 not-focus:opacity-50 md:focus:outline-offset-2"
    style={style} />
}`
const field = (root: ReturnType<typeof renderer.create>) => root.root.findByType('TextInput')

test('compiled input focus changes value typography and outline on the same native field', () => {
  const { C } = loadNativeModule(SOURCE)
  const calls: unknown[] = []
  const ref = react.createRef()
  const focusEvent = { nativeEvent: { target: 7 } }
  const blurEvent = { nativeEvent: { target: 7 } }
  const pressEvent = { nativeEvent: { target: 7 } }
  let focusRequests = 0
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(
      react.createElement(C, {
        inputRef: ref,
        editable: true,
        multiline: true,
        onFocus: (event: unknown) => calls.push(event),
        onBlur: (event: unknown) => calls.push(event),
        onPressIn: (event: unknown) => calls.push(event),
        onChangeText: (value: string) => calls.push(value),
      }),
      {
        createNodeMock: (node: Tree) =>
          node.type === 'TextInput'
            ? {
                focus: () => {
                  focusRequests++
                },
              }
            : null,
      },
    )
  })
  try {
    assert.equal(root.root.findAllByType('TextInput').length, 1)
    assert.equal(root.root.findAllByType('View').length, 0)
    assert.equal(root.root.findAllByType('Pressable').length, 0)
    assert.equal(flat(field(root)).color, '#fb2c36')
    assert.equal(flat(field(root)).fontSize, 14)
    assert.equal(flat(field(root)).paddingStart, 8)
    assert.equal(flat(field(root)).opacity, 0.5)
    assert.equal(field(root).props.value, 'Hi')
    assert.equal(field(root).props.placeholder, 'Name')
    assert.equal(field(root).props.multiline, true)
    renderer.act(() => field(root).props.onPressIn(pressEvent))
    renderer.act(() => field(root).props.onFocus(focusEvent))
    assert.equal(flat(field(root)).color, '#2b7fff')
    assert.equal(flat(field(root)).outlineWidth, 4)
    assert.equal(flat(field(root)).opacity, undefined)
    renderer.act(() => field(root).props.onPressIn(pressEvent))
    assert.equal(
      flat(field(root)).outlineWidth,
      4,
      'typing fields keep visible focus after pointer input',
    )
    renderer.act(() => field(root).props.onChangeText('changed'))
    ref.current.focus()
    assert.equal(focusRequests, 1)
    renderer.act(() => field(root).props.onBlur(blurEvent))
    assert.equal(flat(field(root)).color, '#fb2c36')
    assert.equal(flat(field(root)).outlineWidth, undefined)
    assert.equal(flat(field(root)).opacity, 0.5)
    assert.deepEqual(calls, [pressEvent, focusEvent, pressEvent, 'changed', blurEvent])
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('authored input styles still win and editable updates do not replace its field', () => {
  const { C } = loadNativeModule(SOURCE)
  let root: ReturnType<typeof renderer.create>
  const style = { outlineWidth: 8, color: '#123456' }
  renderer.act(() => {
    root = renderer.create(react.createElement(C, { style, editable: false }))
  })
  try {
    const original = field(root)
    assert.equal(original.props.editable, false)
    renderer.act(() => field(root).props.onFocus({ nativeEvent: {} }))
    assert.equal(flat(field(root)).outlineWidth, 8)
    assert.equal(flat(field(root)).color, '#123456')
    renderer.act(() => root.update(react.createElement(C, { style, editable: true })))
    assert.equal(field(root), original)
    assert.equal(field(root).props.editable, true)
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('plain compiled input typography needs no state helper or handlers', () => {
  const source = `import {TextInput} from '@hozo/core'; export function C() { return <TextInput accessibilityLabel="Field" className="text-red-500 text-sm p-2"/> }`
  const [out] = compileNative(source)
  assert.deepEqual(out.runtimeImports, [])
  assert.deepEqual(out.diagnostics, [])
  const { C } = loadNativeModule(source)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(react.createElement(C))
  })
  try {
    assert.equal(flat(field(root)).color, '#fb2c36')
    assert.equal(flat(field(root)).fontSize, 14)
    assert.equal(field(root).props.onFocus, undefined)
    assert.equal(field(root).props.onBlur, undefined)
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('an ancestor Pressable does not drive the input focus callback', () => {
  const { C } = loadNativeModule(`import {Pressable, TextInput} from '@hozo/core'
  export function C() { return <Pressable accessibilityRole="button" accessibilityLabel="Outer" className="focus-visible:outline-2">
    <TextInput accessibilityLabel="Inner" className="focus-visible:outline-4" />
  </Pressable> }`)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(react.createElement(C))
  })
  try {
    const parent = root.root.findByType('Pressable')
    renderer.act(() => parent.props.onFocus({ nativeEvent: {} }))
    assert.equal(flat(field(root)).outlineWidth, undefined)
    renderer.act(() => field(root).props.onFocus({ nativeEvent: {} }))
    assert.equal(flat(field(root)).outlineWidth, 4)
  } finally {
    renderer.act(() => root.unmount())
  }
})
