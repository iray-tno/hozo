import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { HozoOtpInput: Web } = require('../../patterns/dist/otp-input.js')
const { C: Native } = loadNativeModule(`import {OtpInput} from '@hozo/core'
  export function C(props) {return <OtpInput {...props} length={4} accessibilityLabel="Code"
    cellClassName="size-10 border text-blue-500" activeCellClassName="bg-blue-500"/>}`)

for (const native of [false, true]) {
  test(`${native ? 'Native' : 'Web'} caret follows actual selection without a second field or idle work`, () => {
    let tree: ReturnType<typeof renderer.create>
    const changes: string[] = []
    const completions: string[] = []
    const props = {
      length: 4,
      accessibilityLabel: 'Code',
      defaultValue: '12',
      onChange: (value: string) => changes.push(value),
      onComplete: (value: string) => completions.push(value),
    }
    const Component = native ? Native : Web
    renderer.act(() => {
      tree = renderer.create(react.createElement(Component, props))
    })
    const field = () => tree.root.findByType(native ? 'TextInput' : 'input')
    const original = field()
    const carets = () =>
      tree.root.findAll(
        (node: { props: Record<string, unknown>; type: unknown }) =>
          typeof node.type === 'string' &&
          (native
            ? node.props.testID === 'hozo-otp-caret'
            : Object.hasOwn(node.props, 'data-hozo-otp-caret')),
      )
    const selection = (start: number, end = start) => {
      renderer.act(() =>
        native
          ? field().props.onSelectionChange({ nativeEvent: { selection: { start, end } } })
          : field().props.onSelect({
              currentTarget: {
                value: field().props.value,
                selectionStart: start,
                selectionEnd: end,
              },
            }),
      )
    }
    const change = (value: string) =>
      renderer.act(() =>
        native ? field().props.onChangeText(value) : field().props.onChange({ target: { value } }),
      )
    try {
      assert.equal(carets().length, 0)
      renderer.act(() =>
        native
          ? field().props.onFocus()
          : field().props.onFocus({
              currentTarget: {
                value: '12',
                selectionStart: 2,
                selectionEnd: 2,
              },
            }),
      )
      selection(2)
      assert.equal(carets().length, 1)
      const caret = carets()[0]
      if (native) {
        assert.equal(caret.props.pointerEvents, 'none')
        assert.equal(caret.props.accessible, false)
        assert.equal(caret.props.importantForAccessibility, 'no-hide-descendants')
      } else {
        assert.equal(caret.props['aria-hidden'], true)
        assert.equal(caret.props.style.pointerEvents, 'none')
      }
      const lastParent = caret.parent
      selection(1)
      assert.notEqual(carets()[0].parent, lastParent, 'selection is not inferred from value length')
      selection(0, 2)
      assert.equal(carets().length, 0, 'a selection range is not an insertion caret')
      renderer.act(() => {
        if (native) {
          field().props.onChangeText('123')
          field().props.onSelectionChange({ nativeEvent: { selection: { start: 3, end: 3 } } })
        } else {
          field().props.onChange({ target: { value: '123' } })
          field().props.onSelect({
            currentTarget: { value: '123', selectionStart: 3, selectionEnd: 3 },
          })
        }
      })
      assert.equal(carets().length, 1, 'change and selection in one batch use the new host value')
      change('123 456')
      assert.deepEqual(changes, ['123', '1234'])
      assert.deepEqual(completions, ['1234'])
      assert.equal(carets().length, 0, 'wait for selection after sanitization')
      selection(4)
      assert.equal(carets().length, 1)
      const endStyle = carets()[0].props.style
      assert.ok(
        native
          ? endStyle.at(-1).transform[0].translateX > 0
          : endStyle.transform.includes('0.35em'),
      )
      change('123')
      selection(3)
      assert.equal(carets().length, 1)
      renderer.act(() => tree.update(react.createElement(Component, { ...props, mask: true })))
      assert.equal(carets().length, 1, 'masking must not hide the insertion position')
      assert.equal(field(), original)
      for (const extra of [{ showCaret: false }, { disabled: true }, { readOnly: true }]) {
        renderer.act(() => tree.update(react.createElement(Component, { ...props, ...extra })))
        assert.equal(carets().length, 0)
        assert.equal(field(), original)
      }
      renderer.act(() => tree.update(react.createElement(Component, { ...props, value: '9' })))
      assert.equal(carets().length, 0, 'a controlled value change invalidates the old observation')
      selection(1)
      assert.equal(carets().length, 1)
      renderer.act(() => field().props.onBlur())
      assert.equal(carets().length, 0)
      assert.equal(tree.root.findAllByType(native ? 'TextInput' : 'input').length, 1)
      assert.deepEqual(completions, ['1234'])
    } finally {
      renderer.act(() => tree.unmount())
    }
  })
}
