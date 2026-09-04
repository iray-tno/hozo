import assert from 'node:assert/strict'
import test from 'node:test'
import { computeSafePolygon, DelayGroupMachine, isPointInPolygon } from './hover-geometry.ts'

test('isPointInPolygon: detects points inside and outside polygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  assert.equal(isPointInPolygon({ x: 5, y: 5 }, square), true)
  assert.equal(isPointInPolygon({ x: 1, y: 1 }, square), true)
  assert.equal(isPointInPolygon({ x: 9, y: 9 }, square), true)

  assert.equal(isPointInPolygon({ x: -1, y: 5 }, square), false)
  assert.equal(isPointInPolygon({ x: 15, y: 5 }, square), false)
  assert.equal(isPointInPolygon({ x: 5, y: -2 }, square), false)
  assert.equal(isPointInPolygon({ x: 5, y: 12 }, square), false)
})

test('isPointInPolygon: returns false for degenerate polygon with fewer than 3 vertices', () => {
  assert.equal(isPointInPolygon({ x: 0, y: 0 }, []), false)
  assert.equal(isPointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }]), false)
  assert.equal(
    isPointInPolygon({ x: 0, y: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]),
    false,
  )
})

test('computeSafePolygon: computes polygon for placement bottom', () => {
  const anchor = { x: 100, y: 100, width: 50, height: 30 }
  const floating = { x: 90, y: 140, width: 100, height: 60 }
  const polygon = computeSafePolygon(anchor, floating, 'bottom', 5)
  assert.equal(polygon.length, 4)

  const midPoint = { x: 110, y: 135 }
  assert.equal(isPointInPolygon(midPoint, polygon), true)
  assert.equal(isPointInPolygon({ x: 50, y: 135 }, polygon), false)
})

test('computeSafePolygon: computes polygon for placement top', () => {
  const anchor = { x: 100, y: 100, width: 50, height: 30 }
  const floatingAbove = { x: 90, y: 20, width: 100, height: 60 }
  const polygon = computeSafePolygon(anchor, floatingAbove, 'top', 4)
  assert.equal(polygon.length, 4)

  const midPoint = { x: 110, y: 90 }
  assert.equal(isPointInPolygon(midPoint, polygon), true)
})

test('computeSafePolygon: computes polygon for placement right', () => {
  const anchor = { x: 100, y: 100, width: 50, height: 30 }
  const floatingRight = { x: 160, y: 90, width: 100, height: 60 }
  const polygon = computeSafePolygon(anchor, floatingRight, 'right', 4)
  assert.equal(polygon.length, 4)

  const midPoint = { x: 155, y: 105 }
  assert.equal(isPointInPolygon(midPoint, polygon), true)
})

test('computeSafePolygon: computes polygon for placement left', () => {
  const anchor = { x: 100, y: 100, width: 50, height: 30 }
  const floatingLeft = { x: 10, y: 90, width: 80, height: 60 }
  const polygon = computeSafePolygon(anchor, floatingLeft, 'left', 4)
  assert.equal(polygon.length, 4)

  const midPoint = { x: 95, y: 105 }
  assert.equal(isPointInPolygon(midPoint, polygon), true)
})

test('DelayGroupMachine: transitions and delays', async () => {
  const machine = new DelayGroupMachine({ openDelay: 50, closeDelay: 20, skipDelayDuration: 30 })
  assert.equal(machine.getIsWarm(), false)
  assert.equal(machine.getEffectiveOpenDelay(), 50)
  assert.equal(machine.getCloseDelay(), 20)

  // Open first tooltip -> warm
  machine.onOpen('tooltip-1')
  assert.equal(machine.getIsWarm(), true)
  assert.equal(machine.getEffectiveOpenDelay(), 0)

  // Close tooltip-1 -> still warm during grace period
  let cooledDown = false
  machine.onClose('tooltip-1', () => {
    cooledDown = true
  })
  assert.equal(machine.getIsWarm(), true)

  // Wait 10ms (still within 30ms)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(machine.getIsWarm(), true)
  assert.equal(cooledDown, false)

  // Wait remaining 30ms -> cools down
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(machine.getIsWarm(), false)
  assert.equal(machine.getEffectiveOpenDelay(), 50)
  assert.equal(cooledDown, true)

  // Re-open and dispose
  machine.onOpen('tooltip-2')
  assert.equal(machine.getIsWarm(), true)
  machine.dispose()
  assert.equal(machine.getIsWarm(), false)
})
