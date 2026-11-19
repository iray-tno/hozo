import assert from 'node:assert/strict'
import test from 'node:test'
import { hozoAuthoredEdges } from './authored-edges.ts'

type Flat = Record<string, unknown>

/**
 * React Native's inline padding, as `[left, right]`: with the swap (RTL only)
 * `paddingLeft` becomes `paddingStart`, overwriting it; Yoga then prefers
 * start/end to left/right, and the start is the right side in RTL.
 */
function padding(style: Flat, rtl: boolean, swap: boolean): [unknown, unknown] {
  const s = { ...style }
  if (rtl && swap) {
    if (s.paddingLeft !== undefined) s.paddingStart = s.paddingLeft
    if (s.paddingRight !== undefined) s.paddingEnd = s.paddingRight
    delete s.paddingLeft
    delete s.paddingRight
  }
  const start = s.paddingStart
  const end = s.paddingEnd
  const left = (rtl ? end : start) ?? s.paddingLeft ?? 0
  const right = (rtl ? start : end) ?? s.paddingRight ?? 0
  return [left, right]
}

const directions = [
  { rtl: false, swap: true },
  { rtl: false, swap: false },
  { rtl: true, swap: false },
  { rtl: true, swap: true },
]

test("an author's physical edge beats a class's start or end, on the side React Native gives it alone", () => {
  // `className="px-8" style={{ paddingRight: 99 }}`
  const classes = [{ paddingStart: 32, paddingEnd: 32 }]
  const own = { paddingRight: 99 }
  for (const { rtl, swap } of directions) {
    const composed = hozoAuthoredEdges(classes, [own], rtl, swap) as Flat
    const alone = padding(own, rtl, swap)
    const authoredRight = alone[1] === 99
    assert.deepEqual(
      padding(composed, rtl, swap),
      authoredRight ? [32, 99] : [99, 32],
      `rtl=${rtl} swap=${swap}`,
    )
    // Physical keys would be swapped again, or lose to start/end.
    assert.equal(Object.hasOwn(composed, 'paddingRight'), false)
  }
  // Without the helper the class's end wins in LTR.
  assert.deepEqual(padding({ ...classes[0], ...own }, false, true), [32, 32])
})

test("an author's edge beats an even physical class and a projected one alike", () => {
  for (const classes of [[{ paddingLeft: 16, paddingRight: 16 }], [{ paddingStart: 4 }]]) {
    for (const { rtl, swap } of directions) {
      const composed = hozoAuthoredEdges(classes, [{ paddingRight: 99 }], rtl, swap) as Flat
      const [left, right] = padding(composed, rtl, swap)
      const base = padding(Object.assign({}, ...classes), rtl, swap)
      const authoredRight = !(rtl && swap)
      assert.deepEqual(
        [left, right],
        authoredRight ? [base[0], 99] : [99, base[1]],
        `${JSON.stringify(classes)} rtl=${rtl} swap=${swap}`,
      )
    }
  }
})

test("within the author's own style, React Native's own preference still decides", () => {
  const composed = hozoAuthoredEdges(
    [{ paddingStart: 32, paddingEnd: 32 }],
    [{ paddingRight: 99, paddingEnd: 7 }],
    false,
    true,
  ) as Flat
  assert.deepEqual(padding(composed, false, true), [32, 7])
})

test('every inline family is composed, and other keys flatten last-wins', () => {
  const composed = hozoAuthoredEdges(
    [{ marginStart: 1, start: 2, borderStartWidth: 3, borderEndColor: 'red', opacity: 0.5 }],
    [[false, { marginLeft: 9, left: 9, borderLeftWidth: 9, borderRightColor: 'blue', opacity: 1 }]],
    false,
    true,
  )
  assert.deepEqual(composed, {
    opacity: 1,
    marginStart: 9,
    start: 9,
    borderStartWidth: 9,
    borderEndColor: 'blue',
  })
})

test('an author without inline edges keeps the plain composition and nothing is mutated', () => {
  const classes = [{ paddingStart: 32 }]
  const own = Object.freeze({ opacity: 0.5 })
  const composed = hozoAuthoredEdges(classes, [own], true, true) as unknown[]
  assert.deepEqual(composed, [classes, [own]])
  assert.equal((composed[1] as unknown[])[0], own)

  const frozen = Object.freeze({ paddingRight: 99 })
  const frozenClass = Object.freeze({ paddingEnd: 32 })
  hozoAuthoredEdges([frozenClass], [frozen], false, true)
  assert.deepEqual(frozen, { paddingRight: 99 })
  assert.deepEqual(frozenClass, { paddingEnd: 32 })
})
