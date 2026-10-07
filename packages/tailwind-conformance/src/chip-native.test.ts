// `Chip` on React Native (#141): a `togglebutton` with `checked` when it is
// selectable -- the counterpart of the Web half's `aria-pressed` -- and a
// separate remove button when it is removable.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import './native-render.ts'

const require = createRequire(import.meta.url)

interface Instance {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: Instance) => boolean) => Instance[]
}

const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { root: Instance; unmount: () => void }
  act: (callback: () => void) => void
}
const { HozoChip } = (await import('@hozo/patterns')) as { HozoChip: unknown }

function mount(props: Record<string, unknown>) {
  let root: { root: Instance; unmount: () => void } | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(HozoChip, props, 'Remote'))
  })
  assert.ok(root)
  return root
}

const pressables = (root: { root: Instance }) =>
  root.root.findAll((node) => node.type === 'Pressable')

function press(node: Instance | undefined) {
  const onPress = node?.props.onPress
  assert.equal(typeof onPress, 'function', 'nothing to press')
  ;(onPress as () => void)()
}

test('a selectable chip is a togglebutton whose checked state follows a press', () => {
  const root = mount({ defaultSelected: false })
  const [toggle] = pressables(root)
  assert.equal(toggle?.props.accessibilityRole, 'togglebutton')
  assert.deepEqual(toggle?.props.accessibilityState, { checked: false, disabled: false })
  renderer.act(() => press(toggle))
  assert.deepEqual(pressables(root)[0]?.props.accessibilityState, {
    checked: true,
    disabled: false,
  })
  renderer.act(() => root.unmount())
})

test('removing is its own button, named for what it removes', () => {
  let removed = 0
  const root = mount({ selected: true, onRemove: () => removed++ })
  const buttons = pressables(root)
  assert.equal(buttons.length, 2, 'one control per action')
  const remove = buttons[1]
  assert.equal(remove?.props.accessibilityRole, 'button')
  assert.equal(remove?.props.accessibilityLabel, 'Remove Remote')
  renderer.act(() => press(remove))
  assert.equal(removed, 1)
  renderer.act(() => root.unmount())
})
