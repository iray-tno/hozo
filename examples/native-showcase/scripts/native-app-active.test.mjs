import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'

const require = createRequire(import.meta.url)
const React = require('react')
const { act, createElement, useEffect, useLayoutEffect, useState } = React
const { create } = require('react-test-renderer')
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/use-native-app-active.ts', import.meta.url), 'utf8')
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
globalThis.IS_REACT_ACT_ENVIRONMENT = true
after(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

function fixture(initialState) {
  const listeners = new Set()
  let subscriptions = 0
  const AppState = {
    currentState: initialState,
    addEventListener(type, listener) {
      assert.equal(type, 'change')
      subscriptions++
      listeners.add(listener)
      return { remove: () => listeners.delete(listener) }
    },
    change(state) {
      // RN's internal listener updates currentState before consumer listeners.
      AppState.currentState = state
      for (const listener of listeners) listener(state)
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', code)((name) => {
    if (name === 'react') return React
    if (name === 'react-native') return { AppState }
    throw new Error(`Unexpected lifecycle dependency: ${name}`)
  }, module)
  function CurrentPolicy() {
    return createElement('frame-policy', { active: module.exports.useNativeAppActive() })
  }
  // Control: the former story implementation, with real React hooks, not a
  // simulated state machine. It must fail the same render/subscription schedule.
  function FormerPolicy() {
    const [active, setActive] = useState(AppState.currentState === 'active')
    useEffect(() => {
      const subscription = AppState.addEventListener('change', (value) =>
        setActive(value === 'active'),
      )
      return () => subscription.remove()
    }, [])
    return createElement('frame-policy', { active })
  }
  function ResumeBeforePassiveSubscription({ children }) {
    useLayoutEffect(() => AppState.change('active'), [])
    return children
  }
  return {
    AppState,
    CurrentPolicy,
    FormerPolicy,
    ResumeBeforePassiveSubscription,
    get listenerCount() {
      return listeners.size
    },
    get subscriptionCount() {
      return subscriptions
    },
  }
}

for (const initial of ['background', null]) {
  test(`resume between render and subscribe is recovered from ${initial}, unlike the former code`, async () => {
    for (const current of [false, true]) {
      const model = fixture(initial)
      let tree
      try {
        await act(() => {
          tree = create(
            createElement(
              model.ResumeBeforePassiveSubscription,
              null,
              createElement(current ? model.CurrentPolicy : model.FormerPolicy),
            ),
          )
        })
        assert.equal(model.AppState.currentState, 'active')
        assert.equal(tree.toJSON().props.active, current)
        assert.equal(model.listenerCount, 1)
      } finally {
        await act(() => tree?.unmount())
      }
      assert.equal(model.listenerCount, 0)
    }
  })
}

test('live foreground/background changes preserve the demand pause policy without resubscribing', async () => {
  const model = fixture('active')
  let tree
  try {
    await act(() => {
      tree = create(createElement(model.CurrentPolicy))
    })
    assert.equal(tree.toJSON().props.active, true)
    for (const state of ['background', 'active', 'inactive', 'active', 'unknown', 'active']) {
      await act(() => model.AppState.change(state))
      assert.equal(tree.toJSON().props.active, state === 'active')
      assert.equal(model.listenerCount, 1)
    }
    await act(() => tree.update(createElement(model.CurrentPolicy)))
    assert.equal(model.subscriptionCount, 1)
  } finally {
    await act(() => tree?.unmount())
  }
  assert.equal(model.listenerCount, 0)
})
