import assert from 'node:assert/strict'
import test from 'node:test'
import { hozoSplitTextStyle } from './index.ts'

test('text partition preserves the existing Native pattern property boundary', () => {
  const text = {
    color: '#123456',
    fontFamily: 'Body',
    fontSize: 18,
    fontStyle: 'italic',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    letterSpacing: 1,
    lineHeight: 24,
    textAlign: 'center',
    textDecorationColor: '#654321',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 3,
    textTransform: 'uppercase',
  }
  const box = {
    paddingTop: 12,
    opacity: 0.5,
    borderRadius: 6,
    transform: [{ scale: 2 }],
    customHostProp: 7,
  }
  const input = Object.freeze({ ...box, ...text })
  assert.deepEqual(hozoSplitTextStyle(input), [box, text])
  assert.deepEqual(input, { ...box, ...text }, 'do not consume or mutate caller styles')
})

test('partition keeps explicit undefined resets and does not clone nested host values', () => {
  const variants = ['tabular-nums']
  const transform = [{ scale: 2 }]
  const [box, text] = hozoSplitTextStyle({ color: undefined, fontVariant: variants, transform })
  assert.ok(Object.hasOwn(text, 'color'))
  assert.equal(text.color, undefined)
  assert.equal(text.fontVariant, variants)
  assert.equal(box.transform, transform)
  assert.deepEqual(hozoSplitTextStyle({}), [{}, {}])
})
