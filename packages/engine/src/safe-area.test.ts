import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { useHozoProvidedSafeArea, useHozoSafeArea } from './safe-area.native.ts'

// This host has no `react-native-safe-area-context`, which is the app the two
// hooks have to disagree about.
const read = (hook: () => unknown) => {
  let seen: unknown
  const Probe = () => {
    seen = hook()
    return null
  }
  renderToString(createElement(Probe))
  return seen
}

const NONE = { top: 0, right: 0, bottom: 0, left: 0 }

test('a component insetting itself reads zeros without the package, and says nothing', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  assert.deepEqual(read(useHozoProvidedSafeArea), NONE)
  assert.equal(warn.mock.callCount(), 0, 'loading the module and reading the context are silent')
})

test('a safe-area class without the package reads zeros and warns once, when it renders', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  assert.deepEqual(read(useHozoSafeArea), NONE)
  assert.deepEqual(read(useHozoSafeArea), NONE)
  assert.equal(warn.mock.callCount(), 1)
  assert.match(String(warn.mock.calls[0]?.arguments[0]), /react-native-safe-area-context/)
})
