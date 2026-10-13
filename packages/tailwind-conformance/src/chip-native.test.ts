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

// #787: the same source, compiled for both platforms. Each class list has to
// land on the element it names -- the chip, or its remove button -- in every
// shape a chip takes, and on Native that means as a style, because a
// pattern there has no class list to read.
const { compile } = (await import('@hozo/compiler')) as {
  compile: (source: string, filename?: string) => { jsx: string; css: string }[]
}
const { renderWeb } = await import('./render.ts')
const { loadNativeModule } = await import('./native-render.ts')
const stub = require('react-native') as {
  StyleSheet: { flatten: (style: unknown) => Record<string, unknown> }
}
const webChip = require('../../patterns/dist/chip.js') as { HozoChip: unknown }

const SHAPES = {
  'label only': '',
  'selectable only': ' defaultSelected={false}',
  'removable only': ' onRemove={() => {}}',
  'selectable and removable': ' defaultSelected={false} onRemove={() => {}}',
} as const

const sourceFor = (props: string) => `
  import { Chip } from '@hozo/core'
  export function C() {
    return <Chip${props} className="bg-red-500 text-white" removeClassName="p-3">Remote</Chip>
  }`

for (const [shape, props] of Object.entries(SHAPES)) {
  test(`${shape}: the chip's classes reach the chip and the remove button's reach it, on both platforms`, () => {
    const removable = props.includes('onRemove')

    // Web: compiled classes, on the elements the pattern puts them on.
    const [web] = compile(sourceFor(props), 'C.tsx')
    assert.ok(web, 'the Web compiler lowered nothing')
    const [rendered] = renderWeb([{ name: 'C', jsx: web.jsx }], { HozoChip: webChip.HozoChip })
    const html = rendered?.html ?? ''
    assert.match(web.css, /\.hozo-0 \{[^}]*background-color/, web.css)
    assert.match(html, /^<[a-z]+ [^>]*class="hozo-0"/, html)
    if (removable) {
      assert.match(web.css, /\.hozo-1 \{[^}]*padding/, web.css)
      assert.match(html, /<button[^>]*aria-label="Remove Remote"[^>]*class="hozo-1"/, html)
    }

    // Native: the same classes as styles, on the same elements.
    const { C } = loadNativeModule(sourceFor(props))
    let root: { root: Instance; unmount: () => void } | undefined
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    assert.ok(root)
    const flat = (node: Instance | undefined) => stub.StyleSheet.flatten(node?.props.style)
    const hosts = root.root.findAll(
      (node) =>
        (node.type === 'View' || node.type === 'Pressable') && node.props.style !== undefined,
    )
    const chip = hosts.find((node) => flat(node).backgroundColor !== undefined)
    assert.ok(chip, "the chip's background reached no element")
    if (removable) {
      const [remove] = root.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button',
      )
      assert.equal(
        flat(remove).padding ?? flat(remove).paddingTop,
        12,
        'removeClassName missed the remove button',
      )
      assert.equal(
        flat(remove).backgroundColor,
        undefined,
        "the chip's background leaked onto the remove button",
      )
    }
    // The label's colour is on the rendered Text, which is where RN draws it.
    // A callback that never reached RN must not pass by being called manually.
    const [labelText] = root.root.findAll(
      (node) => node.type === 'Text' && node.props.children === 'Remote',
    )
    assert.equal(flat(labelText).color, '#fff', "the chip's text colour missed its label")
    renderer.act(() => root?.unmount())
  })
}

// Full Metro lowering, not a hand-built style callback. Dispatching the real
// pattern's handlers updates React state; only the RN hosts are stand-ins.
const stateSource = (props: string, overrides = '') => `
  import { Chip } from '@hozo/core'
  export function C() {
    return <Chip${props}
      className="bg-red-500 hover:bg-blue-500 text-white hover:text-black focus:opacity-75 focus-visible:outline-2 active:opacity-50"
      removeClassName="p-2 hover:bg-green-500 active:opacity-25 focus-visible:outline-2 focus-visible:font-bold"
      ${overrides}>Remote</Chip>
  }`

function mountCompiled(source: string) {
  const { C } = loadNativeModule(source)
  let tree: { root: Instance; unmount: () => void } | undefined
  renderer.act(() => {
    tree = renderer.create(react.createElement(C))
  })
  assert.ok(tree)
  return tree
}

const flat = (node: Instance) => stub.StyleSheet.flatten(node.props.style)
const labelText = (tree: { root: Instance }) => {
  const node = tree.root.findAll(
    (node) => node.type === 'Text' && node.props.children === 'Remote',
  )[0]
  assert.ok(node)
  return node
}
function dispatch(node: Instance, name: string) {
  const handler = node.props[name]
  assert.equal(typeof handler, 'function', `${name} is not wired`)
  renderer.act(() => (handler as () => void)())
}

test('static Chip state classes reach the toggle and actual label, then return to rest', () => {
  const tree = mountCompiled(stateSource(' defaultSelected={false}'))
  try {
    const toggle = pressables(tree)[0]
    assert.ok(toggle)
    assert.equal(flat(toggle).backgroundColor, '#fb2c36')
    assert.equal(flat(labelText(tree)).color, '#fff')
    dispatch(toggle, 'onHoverIn')
    assert.equal(flat(toggle).backgroundColor, '#2b7fff')
    assert.equal(flat(labelText(tree)).color, '#000')
    dispatch(toggle, 'onFocus')
    assert.equal(flat(toggle).opacity, 0.75)
    assert.equal(flat(toggle).outlineWidth, 2)
    dispatch(toggle, 'onPressIn')
    assert.equal(flat(toggle).opacity, 0.5)
    assert.equal(flat(toggle).outlineWidth, undefined, 'pointer clears keyboard focus ring')
    dispatch(toggle, 'onPressOut')
    dispatch(toggle, 'onBlur')
    dispatch(toggle, 'onHoverOut')
    assert.equal(flat(toggle).backgroundColor, '#fb2c36')
    assert.equal(flat(labelText(tree)).color, '#fff')
  } finally {
    renderer.act(() => tree.unmount())
  }
})

test('static Chip row classes observe child hover/press, but only removal owns its focus ring', () => {
  const tree = mountCompiled(stateSource(' defaultSelected={false} onRemove={() => {}}'))
  try {
    const row = tree.root.findAll((node) => node.type === 'View')[0]
    const [toggle, remove] = pressables(tree)
    assert.ok(row && toggle && remove)
    dispatch(remove, 'onFocus')
    assert.equal(flat(remove).outlineWidth, 2)
    assert.equal(flat(row).outlineWidth, undefined)
    assert.equal(flat(row).opacity, undefined, 'child focus is not ancestor focus')
    const icon = tree.root.findAll((node) => node.type === 'Text' && node.props.children === '×')[0]
    assert.ok(icon)
    assert.equal(flat(icon).fontWeight, '700')
    dispatch(remove, 'onHoverIn')
    assert.equal(flat(remove).backgroundColor, '#00c950')
    assert.equal(flat(row).backgroundColor, '#2b7fff')
    assert.equal(flat(labelText(tree)).color, '#000')
    dispatch(toggle, 'onPressIn')
    assert.equal(flat(row).opacity, 0.5)
    assert.equal(flat(remove).opacity, undefined, 'toggle press is not remove press')
    dispatch(toggle, 'onPressOut')
    dispatch(remove, 'onPressIn')
    assert.equal(flat(remove).opacity, 0.25)
    assert.equal(flat(row).opacity, 0.5)
  } finally {
    renderer.act(() => tree.unmount())
  }
})

test('explicit Chip styles still win over compiled base and state styles on both slots', () => {
  const tree = mountCompiled(
    stateSource(
      ' defaultSelected={false} onRemove={() => {}}',
      'style={{ backgroundColor: "purple", color: "orange", opacity: 0.9 }} removeStyle={{ opacity: 0.8 }}',
    ),
  )
  try {
    const row = tree.root.findAll((node) => node.type === 'View')[0]
    const remove = pressables(tree)[1]
    assert.ok(row && remove)
    dispatch(remove, 'onHoverIn')
    dispatch(remove, 'onPressIn')
    assert.equal(flat(row).backgroundColor, 'purple')
    assert.equal(flat(row).opacity, 0.9)
    assert.equal(flat(labelText(tree)).color, 'orange')
    assert.equal(flat(remove).opacity, 0.8)
    assert.equal(flat(remove).padding ?? flat(remove).paddingTop, 8)
  } finally {
    renderer.act(() => tree.unmount())
  }
})
