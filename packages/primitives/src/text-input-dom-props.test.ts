import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { hozoTextInputDomProps } from './generated/text-input-dom-props.ts'
import { HozoTextInput } from './text-input.ts'

// #1118: a compiled TextInput receives its spread in the primitive's words.
const props = {
  value: 'hi',
  placeholder: 'Email',
  maxLength: 40,
  accessibilityLabel: 'Email',
  accessibilityHint: 'For the receipt',
  accessibilityLabelledBy: 'email-label',
  testID: 'email',
  nativeID: 'email-input',
  editable: false,
  autoCorrect: false,
  keyboardType: 'email-address',
  returnKeyType: 'next',
  secureTextEntry: true,
  placeholderTextColor: '#999',
  cursorColor: '#f00',
  'data-step': '2',
  onChangeText: () => {},
}

const attributes = (html: string | undefined) =>
  [...(html ?? '').matchAll(/ ([\w-]+)="([^"]*)"/g)].map(([, n, v]) => `${n}=${v}`).sort()

test('the compiled <input> matches the uncompiled TextInput for the same props', () => {
  const compiled = renderToStaticMarkup(createElement('input', hozoTextInputDomProps(props)))
  const fallback = renderToStaticMarkup(createElement(HozoTextInput, props))
  assert.deepEqual(attributes(compiled), attributes(fallback))
})

test('the compiled <textarea> matches the uncompiled multiline TextInput', () => {
  const multiline = { ...props, multiline: true, numberOfLines: 4 }
  const compiled = renderToStaticMarkup(
    createElement('textarea', hozoTextInputDomProps(multiline, true)),
  )
  const fallback = renderToStaticMarkup(createElement(HozoTextInput, multiline))
  assert.deepEqual(attributes(compiled), attributes(fallback))
})

test('typing calls onChangeText with the text, and onChange with the event', () => {
  const seen: unknown[] = []
  const dom = hozoTextInputDomProps({
    onChange: (event: unknown) => seen.push(event),
    onChangeText: (text: string) => seen.push(text),
  }) as { onChange(event: unknown): void; onChangeText?: unknown }
  const event = { currentTarget: { value: 'abc' } }
  dom.onChange(event)
  assert.deepEqual(seen, [event, 'abc'])
  assert.equal(dom.onChangeText, undefined)
})

test('an undefined onChangeText does not throw when typed into', () => {
  const dom = hozoTextInputDomProps({ onChangeText: undefined }) as unknown as {
    onChange(event: unknown): void
  }
  dom.onChange({ currentTarget: { value: 'a' } })
})

test('Enter submits a single line, and only with blurOnSubmit on a textarea', () => {
  const submitted: string[] = []
  const onSubmitEditing = (e: { nativeEvent: { text: string } }) =>
    submitted.push(e.nativeEvent.text)
  const press = (dom: unknown) =>
    (dom as { onKeyDown(e: unknown): void }).onKeyDown({
      key: 'Enter',
      currentTarget: { value: 'x', blur() {} },
    })
  press(hozoTextInputDomProps({ onSubmitEditing }))
  press(hozoTextInputDomProps({ onSubmitEditing }, true))
  press(hozoTextInputDomProps({ onSubmitEditing, blurOnSubmit: true }, true))
  assert.deepEqual(submitted, ['x', 'x'])
})

test('keys the spread does not hold are not set, so explicit attributes survive it', () => {
  assert.deepEqual(Object.keys(hozoTextInputDomProps({ className: 'x' })), ['className'])
  assert.equal(hozoTextInputDomProps(undefined), undefined)
})
