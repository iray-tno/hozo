import assert from 'node:assert/strict'
import test from 'node:test'
import { compareNativeCandidate } from './native.ts'
import { hasNoNativeCounterpart, NO_NATIVE_COUNTERPART } from './no-native-counterpart.ts'

test('every variant listed as having no React Native counterpart is refused, not covered', () => {
  // The report checks the whole matrix; this is the fast half of the same
  // promise, so a variant Hozo learns to compile fails here first.
  for (const variant of Object.keys(NO_NATIVE_COUNTERPART)) {
    for (const utility of ['flex', 'bg-blue-500', 'p-4']) {
      const result = compareNativeCandidate(`${variant}:${utility}`)
      assert.equal(result.verdict, 'REFUSED', `${variant}:${utility}: ${result.detail ?? ''}`)
    }
  }
})

test('the match is on whole variants, wherever they sit in the stack', () => {
  assert.equal(hasNoNativeCounterpart('print:flex'), true)
  assert.equal(hasNoNativeCounterpart('hover:print:flex'), true)
  assert.equal(hasNoNativeCounterpart('target:hover:p-4'), true)
  assert.equal(hasNoNativeCounterpart('after:hover:p-4'), false)
  // A variant that only contains a listed name is not that variant.
  assert.equal(hasNoNativeCounterpart('first-letter:flex'), false)
  assert.equal(hasNoNativeCounterpart('first:flex'), false)
  assert.equal(hasNoNativeCounterpart('user-invalid:flex'), false)
  assert.equal(hasNoNativeCounterpart('autofill:flex'), true)
  assert.equal(hasNoNativeCounterpart('placeholder-shown:flex'), false)
  assert.equal(hasNoNativeCounterpart('supports-[display:grid]:flex'), false)
  assert.equal(hasNoNativeCounterpart('hover:p-4'), false)
})
