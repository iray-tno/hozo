import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { buttonDataProps } from './button-host-attributes.ts'
import { hozoButtonProps } from './button-host-props.native.ts'

test('the Native boundary retains props identity and reports DOM-only data without printing values', () => {
  const warn = mock.method(console, 'warn', () => {})
  try {
    const plain = { nativeID: 'copy', disabled: true }
    assert.equal(hozoButtonProps(null), null)
    assert.equal(hozoButtonProps(undefined), undefined)
    assert.equal(hozoButtonProps(plain), plain)
    assert.equal(warn.mock.callCount(), 0)
    const metadata = { ...plain, 'data-copy-label': 'private application value' }
    assert.equal(hozoButtonProps(metadata), metadata)
    hozoButtonProps(metadata)
    assert.equal(warn.mock.callCount(), 1)
    const call = warn.mock.calls[0]
    assert.ok(call)
    assert.match(String(call.arguments[0]), /Web DOM dataset/)
    assert.doesNotMatch(String(call.arguments[0]), /private application value/)
    assert.deepEqual(buttonDataProps({ 'data-copy-label': 'Copy', ...plain }), {
      'data-copy-label': 'Copy',
    })
  } finally {
    warn.mock.restore()
  }
})
