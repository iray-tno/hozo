import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { bandScale, linearScale, niceDomain, pointScale, ticks } from './scale.ts'

// Answers from d3-array 3.2.4 and d3-scale 4.0.2 for the same inputs,
// generated once and kept as data so d3 is not a dependency. A difference
// here is a tick a reader would not expect on the axis.
const d3 = JSON.parse(
  readFileSync(new URL('../src/d3-reference.json', import.meta.url), 'utf8'),
) as {
  ticks: [number, number, number, number[]][]
  nice: [number, number, number, [number, number]][]
  band: [
    string[],
    [number, number],
    number,
    number,
    number,
    (number | undefined)[],
    number,
    number,
  ][]
  point: [string[], [number, number], number, number[]][]
}

test("ticks are d3's ticks, to the last digit", () => {
  for (const [start, stop, count, expected] of d3.ticks)
    assert.deepEqual(ticks(start, stop, count), expected, `ticks(${start}, ${stop}, ${count})`)
})

test("a nice domain is d3's nice domain", () => {
  for (const [start, stop, count, expected] of d3.nice)
    assert.deepEqual(niceDomain(start, stop, count), expected, `nice(${start}, ${stop}, ${count})`)
})

test("band and point positions are d3's", () => {
  for (const [
    domain,
    range,
    paddingInner,
    paddingOuter,
    align,
    positions,
    bandwidth,
    step,
  ] of d3.band) {
    const scale = bandScale(domain, range, { paddingInner, paddingOuter, align })
    const label = `band(${domain}, ${range})`
    for (const [i, key] of domain.entries()) assertClose(scale(key), positions[i], label)
    assertClose(scale.bandwidth, bandwidth, label)
    assertClose(scale.step, step, label)
  }
  for (const [domain, range, padding, positions] of d3.point) {
    const scale = pointScale(domain, range, { padding })
    for (const [i, key] of domain.entries())
      assertClose(scale(key), positions[i], `point(${domain})`)
  }
})

test('a linear scale maps, inverts, and survives a domain of one value', () => {
  const y = linearScale([0, 100], [200, 0])
  assert.equal(y(0), 200)
  assert.equal(y(25), 150)
  assert.equal(y.invert(150), 25)
  assert.deepEqual(y.ticks(5), [0, 20, 40, 60, 80, 100])
  const flat = linearScale([5, 5], [200, 0])
  assert.equal(flat(5), 100, 'equal values still draw, in the middle')
})

test('a band scale names no position for an unknown key, and finds the nearest band', () => {
  const x = bandScale(['Jan', 'Feb', 'Mar'], [0, 300], { paddingInner: 0.2 })
  assert.equal(x('Apr'), undefined)
  assert.equal(x.indexAt(0), 0)
  assert.equal(x.indexAt(150), 1)
  assert.equal(x.indexAt(1000), 2)
  assert.equal(bandScale([], [0, 300]).indexAt(10), -1)
})

function assertClose(actual: number | undefined, expected: number | undefined, label: string) {
  assert.ok(actual !== undefined && expected !== undefined, label)
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`)
}
