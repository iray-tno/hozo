// `OtpInput` (#149) on both platforms from the same source: one real input
// a reader finds as one named field, asking the platform for a one-time code,
// with cells drawn over it and hidden. The Native half renders against the RN
// stub, not a device.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'
import { renderWeb } from './render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const { compile } = require('@hozo/compiler') as {
  compile: (source: string, filename?: string) => { jsx: string; css: string }[]
}
const webOtp = require('../../patterns/dist/otp-input.js') as { HozoOtpInput: unknown }
const flat = (node: { props: Record<string, unknown> } | undefined) =>
  stub.StyleSheet.flatten([node?.props.style].flat(Infinity))

const SOURCE = `
  import { OtpInput } from '@hozo/core'
  export function C({ value, onChange, onComplete, mask }) {
    return <OtpInput length={6} value={value} onChange={onChange} onComplete={onComplete} mask={mask}
      accessibilityLabel="Verification code" className="gap-2 text-slate-900"
      cellClassName="size-10 border" activeCellClassName="border-blue-600" filledCellClassName="bg-slate-100" />
  }`

test('on the Web: one input asking for a one-time code, and the cells hidden', () => {
  const [out] = compile(SOURCE, 'C.tsx')
  assert.ok(out, 'the Web compiler lowered nothing')
  const [{ html }] = renderWeb([{ name: 'C', jsx: out.jsx }], {
    HozoOtpInput: webOtp.HozoOtpInput,
    value: '123',
    onChange: undefined,
    onComplete: undefined,
    mask: false,
  })
  const inputs = html.match(/<input [^>]*>/g) ?? []
  assert.equal(inputs.length, 1, html)
  const [input] = inputs
  assert.match(input as string, /autoComplete="one-time-code"|autocomplete="one-time-code"/, html)
  assert.match(input as string, /inputMode="numeric"|inputmode="numeric"/, html)
  assert.match(input as string, /aria-label="Verification code"/, html)
  assert.match(input as string, /value="123"/, html)
  assert.match(html, /6 characters/, html)
  const cells = html.match(/<span aria-hidden="true"[^>]*>[^<]*<\/span>/g) ?? []
  assert.equal(cells.length, 6, html)
  assert.match(cells[0] as string, />1</)
  assert.match(cells[0] as string, /class="hozo-1 hozo-3"/, 'a filled cell gets the filled class')
  assert.match(cells[4] as string, /class="hozo-1"/, 'an empty cell gets only the cell class')
})

function mount(props: Record<string, unknown>) {
  const { C } = loadNativeModule(SOURCE)
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, props))
  })
  return root
}
const input = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll((node: Tree) => node.type === 'TextInput')

test('on Native: one TextInput asking each platform for a one-time code', () => {
  const root = mount({ value: '' })
  const fields = input(root)
  assert.equal(fields.length, 1)
  const field = fields[0]
  assert.equal(field.props.textContentType, 'oneTimeCode')
  assert.equal(field.props.autoComplete, 'sms-otp')
  assert.equal(field.props.keyboardType, 'number-pad')
  assert.equal(field.props.accessibilityLabel, 'Verification code')
  assert.equal(field.props.accessibilityHint, '6 characters')
  const cells = root.root.findAll(
    (node: Tree) =>
      node.type === 'View' && node.props.importantForAccessibility === 'no-hide-descendants',
  )
  assert.equal(cells.length, 6, 'the cells are hidden from a reader')
  renderer.act(() => root.unmount())
})

test('on Native: a pasted code with spaces fills every cell and completes once', () => {
  const completed: string[] = []
  const changed: string[] = []
  const root = mount({
    onChange: (v: string) => changed.push(v),
    onComplete: (v: string) => completed.push(v),
  })
  renderer.act(() => (input(root)[0].props.onChangeText as (v: string) => void)('123 456'))
  assert.deepEqual(changed, ['123456'])
  assert.deepEqual(completed, ['123456'])
  const texts = root.root
    .findAll((node: Tree) => node.type === 'Text')
    .map((node: Tree) => node.props.children)
  assert.deepEqual(texts, ['1', '2', '3', '4', '5', '6'])
  renderer.act(() => root.unmount())
})

test('on Native: the active cell is styled while focused, filled cells always, and text styles reach the characters', () => {
  const root = mount({ value: '12' })
  const cells = () =>
    root.root.findAll(
      (node: Tree) =>
        node.type === 'View' && node.props.importantForAccessibility === 'no-hide-descendants',
    )
  assert.ok(flat(cells()[0]).backgroundColor, 'filledCellClassName missed a filled cell')
  assert.equal(flat(cells()[2]).backgroundColor, undefined)
  const before = flat(cells()[2]).borderColor
  renderer.act(() => (input(root)[0].props.onFocus as () => void)())
  assert.notEqual(flat(cells()[2]).borderColor, before, 'activeCellClassName missed the next cell')
  const [first] = root.root.findAll((node: Tree) => node.type === 'Text')
  assert.ok(flat(first).color, "the box's text colour missed the characters")
  renderer.act(() => root.unmount())
})

test('on Native: a PIN is entered as a password and drawn as dots', () => {
  const root = mount({ value: '12', mask: true })
  assert.equal(input(root)[0].props.secureTextEntry, true)
  const texts = root.root
    .findAll((node: Tree) => node.type === 'Text')
    .map((node: Tree) => node.props.children)
  assert.deepEqual(texts.slice(0, 3), ['•', '•', ''])
  renderer.act(() => root.unmount())
})

const FOCUS_SOURCE = `
  import { OtpInput } from '@hozo/core'
  export function C({ value = '12', disabled, inputStyle, inputClassName }) {
    return <OtpInput length={4} value={value} disabled={disabled} accessibilityLabel="Code"
      cellClassName="size-10 border" activeCellClassName="bg-blue-500" filledCellClassName="text-red-500"
      inputClassName="rounded-lg focus:outline-2 focus-visible:outline-4 md:focus:outline-offset-2 not-focus:opacity-50 disabled:outline-1"
      inputStyle={inputStyle} />
  }`

function event(node: Tree, name: string) {
  assert.equal(typeof node.props[name], 'function', `${name} is not wired`)
  renderer.act(() => (node.props[name] as (event: unknown) => void)({ nativeEvent: {} }))
}
const frame = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll((node: Tree) => node.type === 'View' && node.props.pointerEvents === 'none')[0]
const cells = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll(
    (node: Tree) =>
      node.type === 'View' &&
      node.props.pointerEvents !== 'none' &&
      node.props.importantForAccessibility === 'no-hide-descendants',
  )

test('compiled OTP input classes style only the real field decoration and follow its modality', () => {
  const { C } = loadNativeModule(FOCUS_SOURCE)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(react.createElement(C))
  })
  try {
    assert.equal(input(root).length, 1)
    assert.equal(flat(frame(root)).borderRadius, 8)
    assert.equal(flat(frame(root)).opacity, 0.5, 'not-focus is evaluated on the input')
    assert.equal(frame(root).props.accessible, false)
    assert.equal(frame(root).props.importantForAccessibility, 'no-hide-descendants')
    event(input(root)[0], 'onFocus')
    assert.equal(flat(frame(root)).opacity, undefined)
    assert.equal(flat(frame(root)).outlineWidth, 4)
    assert.equal(flat(input(root)[0]).opacity, 0.011, 'decoration must not make glyphs visible')
    assert.equal(flat(input(root)[0]).color, 'transparent')
    assert.equal(input(root)[0].props.caretHidden, true)
    for (const cell of cells(root)) assert.equal(flat(cell).outlineWidth, undefined)
    assert.equal(
      flat(cells(root)[2]).backgroundColor,
      '#2b7fff',
      'activeCellClassName still selects the next cell',
    )
    assert.equal(flat(cells(root)[0].findByType('Text')).color, '#fb2c36')
    event(input(root)[0], 'onPointerDown')
    assert.equal(
      flat(frame(root)).outlineWidth,
      4,
      'typing fields retain visible focus after a pointer',
    )
    event(input(root)[0], 'onKeyDown')
    assert.equal(flat(frame(root)).outlineWidth, 4)
    const wrapper = root.root.findAll((node: Tree) => node.type === 'Pressable')[0]
    event(wrapper, 'onHoverIn')
    event(wrapper, 'onPressIn')
    assert.equal(
      flat(frame(root)).outlineWidth,
      4,
      'wrapper pointer input must not clear the real typing field focus indicator',
    )
    event(wrapper, 'onPressOut')
    event(input(root)[0], 'onBlur')
    assert.equal(flat(frame(root)).outlineWidth, undefined)
    assert.equal(flat(frame(root)).opacity, 0.5)
    assert.equal(flat(cells(root)[2]).backgroundColor, undefined)
    renderer.act(() => root.update(react.createElement(C, { disabled: true })))
    assert.equal(flat(frame(root)).outlineWidth, 1)
    assert.equal(input(root)[0].props.editable, false)
    assert.equal(root.root.findAll((node: Tree) => node.type === 'TextInput').length, 1)
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('a pointer-first OTP focus also indicates the real input until blur', () => {
  const { C } = loadNativeModule(FOCUS_SOURCE)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(react.createElement(C))
  })
  try {
    const wrapper = root.root.findByType('Pressable')
    event(wrapper, 'onPressIn')
    event(input(root)[0], 'onPointerDown')
    assert.equal(flat(frame(root)).outlineWidth, undefined)
    event(input(root)[0], 'onFocus')
    assert.equal(flat(frame(root)).outlineWidth, 4)
    assert.equal(input(root).length, 1)
    for (const cell of cells(root)) assert.equal(flat(cell).outlineWidth, undefined)
    event(input(root)[0], 'onBlur')
    assert.equal(flat(frame(root)).outlineWidth, undefined)
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('explicit OTP input styles win without changing hit geometry or transparent glyphs', () => {
  const { C } = loadNativeModule(FOCUS_SOURCE)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(
      react.createElement(C, {
        inputStyle: { outlineWidth: 7, borderRadius: 12, color: '#123456', opacity: 1, width: 30 },
      }),
    )
  })
  try {
    event(input(root)[0], 'onFocus')
    assert.equal(flat(frame(root)).outlineWidth, 7)
    assert.equal(flat(frame(root)).borderRadius, 12)
    assert.equal(flat(frame(root)).opacity, 1, 'paint is not attenuated by the TextInput')
    assert.equal(flat(frame(root)).width, '100%')
    assert.equal(flat(input(root)[0]).width, '100%')
    assert.equal(flat(input(root)[0]).color, 'transparent')
    assert.equal(flat(input(root)[0]).opacity, 0.011)
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('OTP ambient focus hooks also produce executable output for one-line component bodies', () => {
  const source = FOCUS_SOURCE.replace("from '@hozo/core'", "from '@hozo/core';").replace(
    /\s*\n\s*/g,
    ' ',
  )
  const { C } = loadNativeModule(source)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(react.createElement(C))
  })
  try {
    event(input(root)[0], 'onFocus')
    assert.equal(flat(frame(root)).outlineWidth, 4)
    assert.equal(input(root).length, 1)
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('Web lowering keeps the same input focus selectors off virtual cells', () => {
  const [out] = compile(FOCUS_SOURCE, 'Otp.tsx')
  const [{ html }] = renderWeb([{ name: 'C', jsx: out.jsx }], {
    HozoOtpInput: webOtp.HozoOtpInput,
    value: '12',
    disabled: false,
    inputStyle: undefined,
    inputClassName: undefined,
  })
  assert.match(html, /<input[^>]*class="hozo-4"/)
  assert.match(out.css, /\.hozo-4:focus/)
  assert.match(out.css, /\.hozo-4:focus-visible/)
  const virtual = html.match(/<span aria-hidden="true"[^>]*>/g) ?? []
  assert.equal(virtual.length, 4)
  for (const cell of virtual) assert.doesNotMatch(cell, /hozo-4/)
})

test('full Native lowering still diagnoses static cell focus variants rather than inventing focus owners', () => {
  for (const slot of ['cellClassName', 'activeCellClassName', 'filledCellClassName']) {
    for (const classes of [
      'focus:outline-2',
      'focus-visible:font-bold',
      'not-focus:opacity-50',
      'focus:focus-visible:outline-2',
    ]) {
      assert.throws(
        () =>
          loadNativeModule(`import {OtpInput} from '@hozo/core'
        export function C() { return <OtpInput accessibilityLabel="Code" ${slot}="${classes}"/> }`),
        /NOT_WIRED_ON_NATIVE/,
        `${slot}/${classes}`,
      )
    }
  }
})

const SEMANTIC_SOURCE = `import { OtpInput } from '@hozo/core'
export function C({disabled,readOnly,mask,inputStyle}) {
  return <OtpInput accessibilityLabel="Code" value="12" length={4} mask={mask}
    disabled={disabled} readOnly={readOnly}
    inputClassName="enabled:rounded-lg disabled:outline-offset-4 not-disabled:outline-offset-2 read-only:outline-2 not-read-only:outline-4 read-only:focus:opacity-50 aria-disabled:outline-8 not-aria-disabled:aspect-square"
    className="disabled:opacity-25 enabled:outline-8 read-only:rounded-lg not-read-only:opacity-50 aria-disabled:outline-8"
    cellClassName="size-10 disabled:opacity-25 enabled:outline-8 read-only:rounded-lg not-read-only:opacity-50 aria-disabled:outline-8"
    activeCellClassName="read-only:rounded-lg disabled:outline-8" filledCellClassName="read-only:rounded-lg disabled:outline-8"
    inputStyle={inputStyle} />
}`

test('compiled OTP field semantics include disabled read-only and preserve one transparent input', () => {
  const { C } = loadNativeModule(SEMANTIC_SOURCE)
  let root: ReturnType<typeof renderer.create>
  const render = (props = {}) =>
    renderer.act(() => {
      const element = react.createElement(C, props)
      if (root) root.update(element)
      else root = renderer.create(element)
    })
  try {
    for (const mask of [false, true])
      for (const disabled of [false, true])
        for (const readOnly of [false, true]) {
          render({ disabled, readOnly, mask })
          assert.equal(input(root).length, 1)
          const field = input(root)[0]
          assert.equal(field.props.editable, !disabled && !readOnly)
          assert.equal(Boolean(field.props.readOnly), disabled || readOnly)
          assert.deepEqual(field.props.accessibilityState, { disabled })
          assert.equal(field.props.secureTextEntry, mask)
          assert.equal(flat(frame(root)).outlineWidth, disabled || readOnly ? 2 : 4)
          assert.equal(flat(frame(root)).outlineOffset, disabled ? 4 : 2)
          assert.equal(flat(frame(root)).borderRadius, disabled ? undefined : 8)
          assert.equal(
            flat(frame(root)).aspectRatio,
            1,
            'disabled announcement does not create aria-disabled',
          )
          assert.equal(flat(frame(root)).opacity, undefined)
          if (!disabled) {
            event(field, 'onFocus')
            assert.equal(flat(frame(root)).opacity, readOnly ? 0.5 : undefined)
            event(field, 'onBlur')
          }
          assert.equal(flat(field).opacity, 0.011)
          assert.equal(flat(field).color, 'transparent')
          assert.equal(flat(field).width, '100%')
          const wrapper = root.root.findByType('Pressable')
          assert.equal(flat(wrapper).opacity, undefined)
          assert.equal(flat(wrapper).outlineWidth, undefined)
          assert.equal(flat(wrapper).borderRadius, 8)
          for (const cell of cells(root)) {
            assert.equal(flat(cell).outlineWidth, undefined)
            assert.equal(flat(cell).opacity, undefined)
            assert.equal(flat(cell).borderRadius, 8)
          }
        }
    render({
      disabled: true,
      readOnly: false,
      inputStyle: { outlineWidth: 7, borderRadius: 12, opacity: 1, width: 30 },
    })
    assert.equal(flat(frame(root)).outlineWidth, 7)
    assert.equal(flat(frame(root)).borderRadius, 12)
    assert.equal(flat(frame(root)).opacity, 1)
    assert.equal(flat(frame(root)).width, '100%')
    assert.equal(flat(input(root)[0]).opacity, 0.011)
    assert.equal(flat(input(root)[0]).color, 'transparent')
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('literal OTP input semantics use internal defaults without authored drivers', () => {
  const { C } = loadNativeModule(`import { OtpInput } from '@hozo/core'
    export function C() {return <OtpInput accessibilityLabel="Code"
      inputClassName="disabled:outline-8 enabled:rounded-lg read-only:outline-2 not-read-only:outline-4" />}`)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(react.createElement(C))
  })
  try {
    assert.equal(flat(frame(root)).outlineWidth, 4)
    assert.equal(flat(frame(root)).borderRadius, 8)
    assert.equal(input(root)[0].props.editable, true)
  } finally {
    renderer.act(() => root.unmount())
  }
})
