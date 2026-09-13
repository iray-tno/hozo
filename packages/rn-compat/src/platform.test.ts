import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Platform } from './platform.ts'

test('reports the React Native Web platform facts', () => {
  assert.equal(Platform.OS, 'web')
  assert.equal(Platform.Version, '0.0.0')
})

test('select prefers an explicit web key and otherwise uses default', () => {
  assert.equal(
    Platform.select({ native: 'native', web: 'browser', default: 'fallback' }),
    'browser',
  )
  assert.equal(Platform.select({ native: 'native', default: 'fallback' }), 'fallback')
  assert.equal(Platform.select({ web: undefined, default: 'fallback' }), undefined)
})

test('isTesting follows the process environment', () => {
  assert.equal(Platform.isTesting, process.env.NODE_ENV === 'test')
})
