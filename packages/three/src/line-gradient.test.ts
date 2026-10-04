import assert from 'node:assert/strict'
import test from 'node:test'
import { Color } from 'three'
import { portableLineColorStops } from './line-gradient.ts'

const red = new Color(1, 0, 0)
const green = new Color(0, 1, 0)

test('bounded opaque gradients follow upstream linear colour and perspective interpolation', () => {
  for (const depthRatio of [1, 2, 4, 16, 100, 0.01]) {
    const stops = portableLineColorStops(red, green, 1, depthRatio, 256)
    assert.ok(stops.length > 2 && stops.length <= 32)
    let interval = 0
    for (let index = 0; index <= 4096; index += 1) {
      const s = index / 4096
      while (interval + 2 < stops.length && stops[interval + 1]!.offset < s) interval += 1
      const a = stops[interval]!
      const b = stops[interval + 1]!
      const t = (s - a.offset) / (b.offset - a.offset)
      const expected = red
        .clone()
        .lerp(green, s / ((1 - s) * depthRatio + s))
        .convertLinearToSRGB()
      for (const [channel, value] of [expected.r, expected.g, expected.b].entries()) {
        const offset = 1 + channel * 2
        const from = Number.parseInt(a.color.slice(offset, offset + 2), 16)
        const to = Number.parseInt(b.color.slice(offset, offset + 2), 16)
        assert.ok(Math.abs(value * 255 - (from + (to - from) * t)) < 1.6)
      }
    }
  }
})

test('short and uniform lines keep small budgets and immutable bounded reuse', () => {
  assert.equal(portableLineColorStops(red, green, 1, 100, 2).length, 2)
  assert.ok(portableLineColorStops(red, green, 1, 100, 10).length <= 6)
  assert.equal(portableLineColorStops(red, red, 1, 100, 1000).length, 2)
  const first = portableLineColorStops(red, green, 2, 4, 256)
  assert.equal(first, portableLineColorStops(red, green, 1, 2, 300))
  assert.ok(Object.isFrozen(first) && first.every(Object.isFrozen))
  for (let index = 0; index < 256; index += 1)
    portableLineColorStops(red, green, 1, 3 + index / 256, 256)
  assert.notEqual(first, portableLineColorStops(red, green, 1, 2, 256))
})

test('bounded gradients preserve dark, clamped HDR, material multiplied and reversed colours', () => {
  const from = new Color(0.0001, 0.2, 2)
  const to = new Color(0.03, 0.6, -0.1)
  const stops = portableLineColorStops(from, to, 4, 1, 256)
  assert.equal(stops[0]?.color, `#${from.getHexString()}`)
  assert.equal(stops.at(-1)?.color, `#${to.getHexString()}`)
  const reversed = portableLineColorStops(to, from, 1, 4, 256)
  assert.equal(reversed[0]?.color, stops.at(-1)?.color)
  assert.equal(reversed.at(-1)?.color, stops[0]?.color)
  assert.ok(stops.every((stop, index) => index === 0 || stop.offset > stops[index - 1]!.offset))
})
