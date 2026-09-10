import assert from 'node:assert/strict'
import { test } from 'node:test'

import { StyleSheet } from './stylesheet.ts'

test('create preserves named object styles and Web hairlines', () => {
  const styles = StyleSheet.create({ card: { padding: 8 } })
  assert.deepEqual(styles.card, { padding: 8 })
  assert.equal(StyleSheet.hairlineWidth, 1)
  assert.deepEqual(StyleSheet.absoluteFill, {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  })
})

test('flatten recursively merges arrays and ignores falsey entries', () => {
  assert.deepEqual(
    StyleSheet.flatten({ color: 'red', padding: 2 }, [false, null, [{ padding: 4 }]]),
    { color: 'red', padding: 4 },
  )
})

test('compose preserves React Native array precedence', () => {
  assert.deepEqual(StyleSheet.compose({ opacity: 1 }, { opacity: 0.5 }), [
    { opacity: 1 },
    { opacity: 0.5 },
  ])
})
