import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'

// #876. A pressable's text styles reach a label that arrives as `children`
// -- the shape a styled component like `@hozo/ui`'s Button has, where the
// caller writes the label in another file. React Native does not inherit
// text styles from a View, so the compiler hands them to `HozoPressable`
// (`hozoTextStyle`), which styles the string or the direct Text it renders.

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

const style = (tree: Tree | undefined): Record<string, unknown> =>
  stub.StyleSheet.flatten([tree?.props.style].flat(Infinity))

const { B, Own } = loadNativeModule(`
  import { Button, Text } from '@hozo/core'
  // The caller's side: a label written where the Button is used.
  export function Own() {
    return <B><Text className="text-black">Own</Text></B>
  }
  export function B({ children, off }) {
    return (
      <Button disabled={off} onPress={() => {}} className="bg-blue-500 text-white font-semibold disabled:text-gray-400 active:text-red-500">
        {children}
      </Button>
    )
  }`)

function mount(element: unknown) {
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(element)
  })
  return root!
}
const texts = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll((node: Tree) => node.type === 'Text')

test('a string label takes the pressable text styles, by state', () => {
  const root = mount(react.createElement(B, { off: false }, 'Save'))
  const [label] = texts(root)
  assert.equal(label?.props.children, 'Save')
  assert.equal(style(label).color, '#fff')
  assert.equal(style(label).fontWeight, '600')
  renderer.act(() => root.root.findByType('Pressable').props.onPressIn({ nativeEvent: {} }))
  assert.equal(style(texts(root)[0]).color, '#fb2c36', 'pressed')
  renderer.act(() => root.root.findByType('Pressable').props.onPressOut({ nativeEvent: {} }))
  assert.equal(style(texts(root)[0]).color, '#fff', 'released')
  renderer.act(() => root.update(react.createElement(B, { off: true }, 'Save')))
  assert.equal(style(texts(root)[0]).color, '#99a1af', 'disabled')
})

test('a direct Text child takes them ahead of its own, so its own still win', () => {
  const root = mount(react.createElement(Own))
  const [label] = texts(root)
  assert.equal(style(label).fontWeight, '600', 'the weight is handed down')
  assert.equal(style(label).color, '#000', "the label's own colour wins")
})
