// `@hozo/patterns`' Alert on React Native (#983): a live region for Android,
// an announcement for iOS, and the text styles on the message's own Text.
// Against the RN stub; no screen reader hears any of it here.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { Tree } from './native-render.ts'
import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

function alert(props: Record<string, unknown>, os: string) {
  const { Alert } = require('../../patterns/src/alert.native.tsx') as { Alert: unknown }
  const announced: string[] = []
  const original = [stub.AccessibilityInfo.announceForAccessibility, stub.Platform.OS]
  stub.AccessibilityInfo.announceForAccessibility = (text: string) => announced.push(text)
  stub.Platform.OS = os
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(Alert, props))
    })
    renderer.act(() => {
      root?.update(react.createElement(Alert, { ...props, children: 'Saved again.' }))
    })
  } finally {
    ;[stub.AccessibilityInfo.announceForAccessibility, stub.Platform.OS] = original
  }
  const view = root?.root.find((node: Tree) => node.type === 'View')
  return { view, announced }
}

test('Android is given a live region and the role; iOS is told the message', () => {
  const android = alert({ live: 'assertive', children: 'Saved.' }, 'android')
  assert.equal(android.view.props.accessibilityLiveRegion, 'assertive')
  assert.equal(android.view.props.role, 'alert')
  assert.deepEqual(android.announced, [], 'Android announces the region itself')

  const ios = alert({ live: 'polite', children: 'Saved.' }, 'ios')
  assert.equal(ios.view.props.role, 'status')
  assert.deepEqual(ios.announced, ['Saved.', 'Saved again.'], 'when it appears and when it changes')
})

test('an alert that is not live says nothing on either platform', () => {
  for (const os of ['android', 'ios']) {
    const { view, announced } = alert({ children: 'Draft' }, os)
    assert.equal(view.props.accessibilityLiveRegion, undefined)
    assert.equal(view.props.role, undefined)
    assert.deepEqual(announced, [])
  }
})
