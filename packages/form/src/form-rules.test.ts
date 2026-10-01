import assert from 'node:assert/strict'
import test from 'node:test'

import { type FormControlState, firstInvalid, shouldSubmit } from './form-rules.ts'

const ok: FormControlState = {}
const bad: FormControlState = { invalid: true, focusable: true }
const gone: FormControlState = { invalid: true, focusable: false }

test('the first invalid control is the first one in the list', () => {
  assert.equal(firstInvalid([ok, bad, bad]), 1)
  assert.equal(firstInvalid([bad, ok]), 0)
  assert.equal(firstInvalid([ok, ok]), null)
  assert.equal(firstInvalid([]), null)
})

test('an unreachable control is skipped rather than focused', () => {
  // Focusing something disconnected or disabled puts focus on `<body>`, which
  // loses the person's place and tells them nothing.
  assert.equal(firstInvalid([gone, bad]), 1)
  assert.equal(firstInvalid([gone]), null)
})

test('focusable is only consulted when it is said', () => {
  // `undefined` means nobody asked, not "no". The Web half always sets it; a
  // caller using the rule on its own should not have to.
  assert.equal(firstInvalid([{ invalid: true }]), 0)
})

test('an invalid control stops the submission even when it cannot be focused', () => {
  // The worst of the three outcomes would be submitting because the field the
  // form was going to complain about had become unreachable: the data goes, and
  // nobody was told.
  assert.equal(shouldSubmit([gone]), false)
  assert.equal(shouldSubmit([ok, bad]), false)
  assert.equal(shouldSubmit([ok, ok]), true)
  assert.equal(shouldSubmit([]), true)
})

test('the two questions are separate, which is why there are two functions', () => {
  // Nothing to focus and nothing to submit: the form does neither, rather than
  // treating "no focus target" as "go ahead".
  assert.equal(firstInvalid([gone]), null)
  assert.equal(shouldSubmit([gone]), false)
})
