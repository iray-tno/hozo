import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Keyboard } from './keyboard.ts'

test('reports the browser keyboard state exposed by React Native Web', () => {
  assert.equal(Keyboard.isVisible(), false)
  assert.equal(Keyboard.metrics(), undefined)
})

test('listener subscriptions can always be removed', () => {
  const subscription = Keyboard.addListener('keyboardDidShow', () => {})
  assert.equal(typeof subscription.remove, 'function')
  subscription.remove()
  Keyboard.removeListener('keyboardDidShow', () => {})
  Keyboard.removeAllListeners('keyboardDidShow')
})

test('dismiss is safe without a browser document', () => {
  assert.doesNotThrow(() => Keyboard.dismiss())
})
