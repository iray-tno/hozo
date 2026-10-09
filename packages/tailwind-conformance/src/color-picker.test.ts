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
