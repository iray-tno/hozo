// `ColorPicker` (#153): swatches as a radio group, hue/saturation/lightness as
// sliders read in words, the hex as a field -- each colour named and
// numbered. The Web half renders server-side; the Native half against the RN
// stub. Neither is a device.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { renderToStaticMarkup } = require('react-dom/server')
const stub = require('react-native')
const webPicker = require('../../patterns/dist/color-picker.js') as { HozoColorPicker: unknown }
const flat = (node: { props: Record<string, unknown> } | undefined) =>
  stub.StyleSheet.flatten([node?.props.style].flat(Infinity))

const PRESETS = ['#ef4444', '#3b82f6', '#10b981', '#1e3a8a']

test('on the Web: a named group, swatches as one radio group, sliders that say their value', () => {
  const html = renderToStaticMarkup(
    react.createElement(webPicker.HozoColorPicker, {
      value: '#3b82f6',
      presets: PRESETS,
      accessibilityLabel: 'Theme colour',
      selectedSwatchClassName: 'is-selected',
    }),
  )
  assert.match(html, /^<div role="group" aria-label="Theme colour">/, html)
  assert.match(html, /role="radiogroup" aria-label="Presets"/, html)
  // The current colour's swatch is checked and the one tab stop; the others are not.
  assert.match(
    html,
    /role="radio" aria-checked="true" aria-label="blue, #3b82f6" tabindex="0"[^>]*class="is-selected"/,
    html,
  )
  assert.match(
    html,
    /role="radio" aria-checked="false" aria-label="red, #ef4444" tabindex="-1"/,
    html,
  )
  assert.match(html, /aria-label="dark blue, #1e3a8a"/, html)
  assert.match(html, /role="slider"[^>]*aria-valuetext="217 degrees, blue"/, html)
  assert.match(html, /role="slider"[^>]*aria-valuetext="91%"/, html)
  assert.match(html, /aria-label="Hex colour"[^>]*value="#3b82f6"/, html)
  assert.doesNotMatch(html, /Pick a colour/, 'no eyedropper unless asked for and supported')
})

const SOURCE = `
  import { ColorPicker } from '@hozo/core'
  export function C({ value, defaultValue, onChange, presets }) {
    return <ColorPicker value={value} defaultValue={defaultValue} onChange={onChange} presets={presets} accessibilityLabel="Theme colour"
      swatchClassName="size-8 rounded-full" selectedSwatchClassName="border-2 border-slate-900"
      sliderClassName="h-3" thumbClassName="size-5" inputClassName="px-2" />
  }`

function mount(props: Record<string, unknown>) {
  const { C } = loadNativeModule(SOURCE)
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, { presets: PRESETS, ...props }))
  })
  return root
}
const radios = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll(
    (node: Tree) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio',
  )

test('on Native: swatches are radios, named and numbered, the current one checked and styled', () => {
  const root = mount({ value: '#3b82f6' })
  const all = radios(root)
  assert.deepEqual(
    all.map((node: Tree) => node.props.accessibilityLabel),
    ['red, #ef4444', 'blue, #3b82f6', 'green, #10b981', 'dark blue, #1e3a8a'],
  )
  assert.deepEqual(all[1].props.accessibilityState, { checked: true, disabled: false })
  assert.equal(flat(all[1]).backgroundColor, '#3b82f6', 'the swatch is its colour')
  assert.ok(
    flat(all[1]).borderWidth ?? flat(all[1]).borderTopWidth,
    'selectedSwatchClassName missed the chosen swatch',
  )
  assert.equal(flat(all[0]).borderWidth ?? flat(all[0]).borderTopWidth, undefined)
  const sliders = root.root.findAll(
    (node: Tree) =>
      node.props.accessibilityRole === 'adjustable' &&
      typeof node.props.accessibilityLabel === 'string',
  )
  assert.deepEqual(
    sliders.map((node: Tree) => node.props.accessibilityLabel),
    ['Hue', 'Saturation', 'Lightness'],
  )
  assert.equal(sliders[0].props.accessibilityValue?.text, '217 degrees, blue')
  renderer.act(() => root.unmount())
})

test('on Native: a swatch press and a typed hex both change the colour', () => {
  const changes: string[] = []
  const root = mount({ defaultValue: '#3b82f6', onChange: (hex: string) => changes.push(hex) })
  renderer.act(() => (radios(root)[0].props.onPress as () => void)())
  assert.deepEqual(changes, ['#ef4444'])
  const field = root.root.findAll((node: Tree) => node.type === 'TextInput')[0]
  renderer.act(() => (field.props.onFocus as () => void)())
  // `#abc` is a colour; the field keeps what was typed while it has focus.
  renderer.act(() => (field.props.onChangeText as (v: string) => void)('#abc'))
  assert.equal(changes.at(-1), '#aabbcc')
  assert.equal(root.root.findAll((node: Tree) => node.type === 'TextInput')[0].props.value, '#abc')
  renderer.act(() => (field.props.onChangeText as (v: string) => void)('#zz'))
  assert.equal(changes.length, 2, 'an unfinished hex changes nothing')
  renderer.act(() => root.unmount())
})

test('on Native: saturation to grey keeps the hue where it was', () => {
  const changes: string[] = []
  const root = mount({ defaultValue: '#3b82f6', onChange: (hex: string) => changes.push(hex) })
  const slider = (label: string) =>
    root.root.findAll(
      (node: Tree) =>
        node.props.accessibilityRole === 'adjustable' && node.props.accessibilityLabel === label,
    )[0]
  const act = (label: string, action: string) =>
    renderer.act(() =>
      (slider(label).props.onAccessibilityAction as (e: unknown) => void)({
        nativeEvent: { actionName: action },
      }),
    )
  for (let i = 0; i < 95; i += 1) act('Saturation', 'decrement')
  assert.equal(slider('Saturation').props.accessibilityValue?.text, '0%')
  assert.equal(slider('Hue').props.accessibilityValue?.text, '217 degrees, blue')
  renderer.act(() => root.unmount())
})

const STATE_SOURCE = `import { ColorPicker } from '@hozo/core'
export function C({ onChange, disabled, swatchStyle, selectedSwatchStyle }) {
  return <ColorPicker defaultValue="#3b82f6" presets={['#ef4444', '#3b82f6']}
    onChange={onChange} disabled={disabled} accessibilityLabel="Theme colour"
    swatchClassName="size-8 hover:bg-black hover:opacity-50 focus:opacity-75 focus-visible:outline-2 active:border-2"
    selectedSwatchClassName="border-2 hover:opacity-25 focus-visible:outline-4"
    swatchStyle={swatchStyle} selectedSwatchStyle={selectedSwatchStyle} />
}`

function mountState(props: Record<string, unknown> = {}) {
  const { C } = loadNativeModule(STATE_SOURCE)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(react.createElement(C, props))
  })
  return root
}

function event(node: Tree, name: string) {
  const handler = node.props[name]
  assert.equal(typeof handler, 'function', `${name} is not wired`)
  renderer.act(() => (handler as () => void)())
}

test('compiled swatch interaction stays per radio, preserves its colour and follows selection', () => {
  const changes: string[] = []
  const root = mountState({ onChange: (hex: string) => changes.push(hex) })
  try {
    const [red, blue] = radios(root)
    event(red, 'onHoverIn')
    assert.equal(flat(red).opacity, 0.5)
    assert.equal(flat(red).backgroundColor, '#ef4444', 'the preset colour wins over hover bg')
    assert.equal(flat(blue).opacity, undefined, 'an idle sibling did not hover')
    event(blue, 'onHoverIn')
    assert.equal(flat(blue).opacity, 0.25, 'selected slot wins over the base slot')
    event(blue, 'onFocus')
    assert.equal(flat(blue).outlineWidth, 4, 'selected focus slot is evaluated by the same host')
    assert.equal(flat(red).outlineWidth, undefined, 'focus is never borrowed from a sibling')
    event(red, 'onPressIn')
    assert.equal(flat(red).borderWidth ?? flat(red).borderTopWidth, 2)
    event(red, 'onPressOut')
    assert.equal(flat(red).borderWidth ?? flat(red).borderTopWidth, undefined)
    event(blue, 'onPressIn')
    assert.equal(flat(blue).outlineWidth, undefined)
    assert.equal(flat(blue).borderWidth ?? flat(blue).borderTopWidth, 2)
    event(blue, 'onPressOut')
    event(red, 'onPress')
    assert.deepEqual(changes, ['#ef4444'])
    const [nextRed, nextBlue] = radios(root)
    assert.equal(flat(nextRed).opacity, 0.25, 'selection moves the stateful slot')
    assert.equal(flat(nextBlue).opacity, 0.75, 'still focused, but no longer selected')
    assert.equal(nextRed.props.accessibilityState?.checked, true)
    assert.equal(nextBlue.props.accessibilityState?.checked, false)
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('compiled swatch styles keep explicit per-slot precedence and disabled hosts', () => {
  const changes: string[] = []
  const root = mountState({
    disabled: true,
    onChange: (hex: string) => changes.push(hex),
    swatchStyle: { opacity: 0.8 },
    selectedSwatchStyle: { opacity: 0.9, outlineWidth: 6 },
  })
  try {
    const [red, blue] = radios(root)
    event(red, 'onHoverIn')
    event(blue, 'onHoverIn')
    event(blue, 'onFocus')
    assert.equal(flat(red).opacity, 0.8)
    assert.equal(flat(blue).opacity, 0.9)
    assert.equal(flat(blue).outlineWidth, 6)
    assert.equal(red.props.disabled, true)
    assert.equal(blue.props.accessibilityState?.disabled, true)
    // A programmatically delivered callback is not a claim that a disabled
    // device host receives focus or activates; RN owns that delivery.
    assert.deepEqual(changes, [])
  } finally {
    renderer.act(() => root.unmount())
  }
})

const SEMANTIC_SOURCE = `import { ColorPicker } from '@hozo/core'
export function C({ value, defaultValue = '#3b82f6', onChange, disabled, swatchStyle, selectedSwatchStyle }) {
  return <ColorPicker value={value} defaultValue={defaultValue} onChange={onChange}
    disabled={disabled} presets={['#ef4444', '#3b82f6']} accessibilityLabel="Theme colour"
    swatchClassName="size-8 disabled:opacity-25 enabled:rounded-lg not-disabled:mt-1 not-enabled:mb-1 aria-checked:border-2 not-aria-checked:border-4 aria-disabled:outline-8 aria-selected:opacity-50 not-aria-disabled:pt-1 not-aria-selected:pb-1 aria-checked:hover:opacity-75 not-aria-checked:not-hover:ml-2"
    selectedSwatchClassName="aria-checked:mt-2 not-aria-checked:mb-2 disabled:opacity-50 enabled:outline-2 not-enabled:outline-4"
    swatchStyle={swatchStyle} selectedSwatchStyle={selectedSwatchStyle} />
}`

test('compiled radio semantics follow selection and disabled changes without borrowing absent ARIA', () => {
  const { C } = loadNativeModule(SEMANTIC_SOURCE)
  const changes: string[] = []
  let root: ReturnType<typeof renderer.create>
  const render = (props = {}) =>
    renderer.act(() => {
      const element = react.createElement(C, {
        onChange: (hex: string) => changes.push(hex),
        ...props,
      })
      if (root) root.update(element)
      else root = renderer.create(element)
    })
  const check = (selected: number, disabled: boolean) => {
    for (const [index, radio] of radios(root).entries()) {
      const checked = index === selected
      assert.deepEqual(radio.props.accessibilityState, { checked, disabled })
      assert.equal(Boolean(radio.props.disabled), disabled)
      assert.equal(flat(radio).backgroundColor, ['#ef4444', '#3b82f6'][index])
      assert.equal(flat(radio).borderTopWidth, checked ? 2 : 4)
      assert.equal(flat(radio).borderRadius, disabled ? undefined : 8)
      assert.equal(flat(radio).paddingTop, 4, 'aria-disabled is absent even on a disabled button')
      assert.equal(flat(radio).paddingBottom, 4, 'selection uses checked, not aria-selected')
      assert.equal(flat(radio).opacity, disabled ? (checked ? 0.5 : 0.25) : undefined)
      assert.equal(
        flat(radio).outlineWidth,
        checked ? (disabled ? 4 : 2) : undefined,
        'no absent-ARIA outline, and selected slot styles stay selected-only',
      )
      assert.equal(flat(radio).marginTop, checked ? 8 : disabled ? undefined : 4)
      assert.equal(
        flat(radio).marginBottom,
        disabled ? 4 : undefined,
        'negated checked styles cannot run inside the selected-only slot',
      )
    }
  }
  try {
    render()
    check(1, false)
    assert.equal(flat(radios(root)[0]).marginLeft, 8)
    event(radios(root)[0], 'onHoverIn')
    assert.equal(flat(radios(root)[0]).marginLeft, undefined)
    assert.equal(flat(radios(root)[0]).opacity, undefined, 'unchecked hover is not checked hover')
    event(radios(root)[1], 'onHoverIn')
    assert.equal(flat(radios(root)[1]).opacity, 0.75)
    event(radios(root)[0], 'onPress')
    assert.deepEqual(changes, ['#ef4444'])
    assert.equal(
      flat(radios(root)[0]).opacity,
      0.75,
      'checked stack moves to the hovered new radio',
    )
    assert.equal(flat(radios(root)[1]).opacity, undefined)
    event(radios(root)[0], 'onHoverOut')
    event(radios(root)[1], 'onHoverOut')
    check(0, false)
    render({ disabled: true })
    check(0, true)
    render({ value: '#3b82f6', disabled: true })
    check(1, true)
    render({ value: '#3b82f6', disabled: false })
    check(1, false)
    event(radios(root)[0], 'onPress')
    assert.equal(changes.at(-1), '#ef4444')
    check(1, false)
    render({ value: '#ef4444' })
    check(0, false)
    render({
      value: '#3b82f6',
      disabled: true,
      swatchStyle: { opacity: 0.8, borderTopWidth: 3, backgroundColor: '#000' },
      selectedSwatchStyle: { opacity: 0.9, borderTopWidth: 5, backgroundColor: '#fff' },
    })
    assert.equal(flat(radios(root)[0]).opacity, 0.8)
    assert.equal(flat(radios(root)[1]).opacity, 0.9)
    assert.equal(flat(radios(root)[0]).borderTopWidth, 3)
    assert.equal(flat(radios(root)[1]).borderTopWidth, 5)
    assert.equal(flat(radios(root)[1]).backgroundColor, '#3b82f6', 'preset colour is still last')
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('literal swatch semantic classes require no authored disabled or accessibilityState prop', () => {
  const { C } = loadNativeModule(`import { ColorPicker } from '@hozo/core'
    export function C() {return <ColorPicker accessibilityLabel="Theme" defaultValue="#3b82f6"
      presets={['#ef4444','#3b82f6']}
      swatchClassName="disabled:opacity-25 enabled:rounded-lg aria-checked:border-2 not-aria-checked:border-4"
      selectedSwatchClassName="aria-checked:outline-2" />}`)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(react.createElement(C))
  })
  try {
    const all = radios(root)
    assert.equal(flat(all[0]).borderTopWidth, 4)
    assert.equal(flat(all[1]).borderTopWidth, 2)
    assert.equal(flat(all[0]).outlineWidth, undefined)
    assert.equal(flat(all[1]).outlineWidth, 2)
    for (const radio of all) {
      assert.equal(flat(radio).opacity, undefined)
      assert.equal(flat(radio).borderRadius, 8)
    }
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('only the first valid matching preset owns checked semantics on Web and compiled Native', () => {
  const { C } = loadNativeModule(`import { ColorPicker } from '@hozo/core'
    export function C({presets,value}) {return <ColorPicker accessibilityLabel="Theme"
      presets={presets} value={value} swatchClassName="aria-checked:border-2"
      selectedSwatchClassName="aria-checked:outline-4" />}`)
  for (const { presets, value, expected } of [
    {
      presets: ['#f00', '#ff0000', 'not-a-colour', '#000000'],
      value: '#ff0000',
      expected: [true, false, false, false],
    },
    {
      presets: ['#f00', '#ff0000', 'not-a-colour', '#000000'],
      value: '#000000',
      expected: [false, false, false, true],
    },
    { presets: ['bad-colour', 'not-a-colour'], value: '#000000', expected: [false, false] },
  ]) {
    const html = renderToStaticMarkup(
      react.createElement(webPicker.HozoColorPicker, {
        presets,
        value,
        accessibilityLabel: 'Theme',
      }),
    )
    assert.deepEqual(
      [...html.matchAll(/role="radio" aria-checked="(true|false)"/g)].map(
        (match) => match[1] === 'true',
      ),
      expected,
      'actual Web selection oracle',
    )
    let root: ReturnType<typeof renderer.create>
    renderer.act(() => {
      root = renderer.create(react.createElement(C, { presets, value }))
    })
    try {
      assert.deepEqual(
        radios(root).map((radio: Tree) => radio.props.accessibilityState.checked),
        expected,
      )
      for (const [index, radio] of radios(root).entries()) {
        assert.equal(flat(radio).borderTopWidth, expected[index] ? 2 : undefined)
        assert.equal(flat(radio).outlineWidth, expected[index] ? 4 : undefined)
      }
    } finally {
      renderer.act(() => root.unmount())
    }
  }
})

test('full ColorPicker lowering keeps unsupported semantic owners and predicates diagnosed', () => {
  for (const [slot, classes] of [
    ['className', 'aria-checked:opacity-50'],
    ['sliderClassName', 'not-aria-checked:opacity-50'],
    ['thumbClassName', 'aria-checked:hover:opacity-50'],
    ['inputClassName', 'aria-expanded:opacity-50'],
    ['swatchClassName', 'aria-expanded:opacity-50'],
    ['selectedSwatchClassName', 'not-aria-expanded:opacity-50'],
  ]) {
    assert.throws(
      () =>
        loadNativeModule(`import { ColorPicker } from '@hozo/core'
      export function C() {return <ColorPicker accessibilityLabel="Theme" ${slot}="${classes}" />}`),
      /NOT_WIRED_ON_NATIVE/,
      `${slot}: ${classes}`,
    )
  }
})
