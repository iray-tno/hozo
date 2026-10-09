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
