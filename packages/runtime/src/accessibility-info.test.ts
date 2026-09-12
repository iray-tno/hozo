import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AccessibilityInfo } from './accessibility-info.ts'

test('AccessibilityInfo keeps the React Native Web server answers', async () => {
  assert.equal(await AccessibilityInfo.isReduceMotionEnabled(), true)
  assert.equal(await AccessibilityInfo.isScreenReaderEnabled(), true)
  assert.equal(await AccessibilityInfo.fetch(), true)
})

test('AccessibilityInfo subscriptions are removable without a browser', () => {
  const handler = () => {}
  const reduceMotion = AccessibilityInfo.addEventListener('reduceMotionChanged', handler)
  const screenReader = AccessibilityInfo.addEventListener('screenReaderChanged', handler)
  reduceMotion.remove()
  screenReader.remove()
  AccessibilityInfo.removeEventListener('reduceMotionChanged', handler)
})

test('browser-owned focus and announcements remain safe no-ops', () => {
  assert.equal(AccessibilityInfo.setAccessibilityFocus(1), undefined)
  assert.equal(AccessibilityInfo.announceForAccessibility('Saved'), undefined)
})
