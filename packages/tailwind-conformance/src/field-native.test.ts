// `Field` on React Native (#983): no `for`, no `aria-describedby`, so the
// label is pointed at by `nativeID` for Android and handed over as a string
// for iOS, and the error and description become the control's hint.
// Against the RN stub; no screen reader reads any of it here.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { Tree } from './native-render.ts'
import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

function mount(props: Record<string, unknown>) {
  const { Field } = require('../../form/src/field.native.tsx') as { Field: unknown }
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(Field, {
        label: 'Email',
        children: (control: Record<string, unknown>) =>
          react.createElement('TextInput', { testID: 'control', ...control }),
        ...props,
      }),
    )
  })
  return root
}
const control = (root: ReturnType<typeof renderer.create>) =>
  root.root.find((node: Tree) => node.props.testID === 'control')

test('the label names the control on both platforms: by reference, and as a string', () => {
  const root = mount({})
  const labelled = control(root).props
  const label = root.root.find((node: Tree) => node.props.nativeID !== undefined)
  // Android follows the reference; iOS can only be handed the text.
  assert.equal(labelled.accessibilityLabelledBy, label.props.nativeID)
  assert.equal(labelled.accessibilityLabel, 'Email')
  assert.equal(labelled.accessibilityHint, undefined, 'nothing to say, so no hint')
})

test('the error, the description and required become the hint, error first', () => {
  const announced: string[] = []
  const original = stub.AccessibilityInfo.announceForAccessibility
  stub.AccessibilityInfo.announceForAccessibility = (text: string) => announced.push(text)
  try {
    const root = mount({
      required: true,
      description: 'We never share it.',
      error: 'That is not an email.',
    })
    assert.equal(
      control(root).props.accessibilityHint,
      'That is not an email. We never share it. Required',
    )
    // Announced as it appears, as `role="alert"` makes it on the Web.
    assert.deepEqual(announced, ['That is not an email.'])
    // The asterisk is drawn and hidden: the hint is what says it.
    const mark = root.root.find((node: Tree) => node.props['aria-hidden'] === true)
    assert.equal(mark.props.children, ' *')
  } finally {
    stub.AccessibilityInfo.announceForAccessibility = original
  }
})

test('a label that is an element takes its name from accessibilityLabel', () => {
  const root = mount({
    label: react.createElement('Text', null, 'Email'),
    accessibilityLabel: 'Work email',
  })
  assert.equal(control(root).props.accessibilityLabel, 'Work email')
})
