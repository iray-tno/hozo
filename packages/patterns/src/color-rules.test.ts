import assert from 'node:assert/strict'
import { test } from 'node:test'
import { colorName, hexToHsla, hslaToHex, parseHex } from './color-rules.ts'

test('hex is read in its four lengths, with or without #, and refused otherwise', () => {
  assert.deepEqual(parseHex('#f00'), { r: 255, g: 0, b: 0, a: 1 })
  assert.deepEqual(parseHex('3B82F6'), { r: 59, g: 130, b: 246, a: 1 })
  assert.equal(parseHex('#3b82f680')?.a, 128 / 255)
  assert.equal(parseHex('#ff00')?.a, 0)
  for (const bad of ['', '#12', '#12345', 'blue', '#gg0000']) assert.equal(parseHex(bad), null, bad)
})

test('hex to HSL and back is the same colour', () => {
  for (const hex of [
    '#3b82f6',
    '#ef4444',
    '#10b981',
    '#000000',
    '#ffffff',
    '#808080',
    '#3b82f680',
  ]) {
    const hsla = hexToHsla(hex)
    assert.ok(hsla, hex)
    assert.equal(hslaToHex(hsla), hex)
  }
})

test('known colours land on their hue and lightness', () => {
  const blue = hexToHsla('#3b82f6')
  assert.ok(
    blue && Math.round(blue.h) === 217 && Math.round(blue.s) === 91 && Math.round(blue.l) === 60,
  )
  assert.equal(hslaToHex({ h: 0, s: 100, l: 50, a: 1 }), '#ff0000')
  assert.equal(hslaToHex({ h: 120, s: 100, l: 25, a: 1 }), '#008000')
})

test('a colour is named by its hue word and how light it is', () => {
  const name = (hex: string) =>
    colorName(hexToHsla(hex) as NonNullable<ReturnType<typeof hexToHsla>>)
  assert.deepEqual(name('#3b82f6'), { hue: 'blue' })
  assert.deepEqual(name('#1e3a8a'), { hue: 'blue', shade: 'dark' })
  assert.deepEqual(name('#fecaca'), { hue: 'red', shade: 'light' })
  assert.deepEqual(name('#f59e0b'), { hue: 'orange' })
  assert.deepEqual(name('#10b981'), { hue: 'green' })
  assert.deepEqual(name('#a855f7'), { hue: 'purple' })
  assert.deepEqual(name('#ec4899'), { hue: 'pink' })
  assert.deepEqual(name('#808080'), { hue: 'gray' })
  assert.deepEqual(name('#000000'), { hue: 'black' })
  assert.deepEqual(name('#ffffff'), { hue: 'white' })
})
