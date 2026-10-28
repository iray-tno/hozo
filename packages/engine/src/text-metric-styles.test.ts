import assert from 'node:assert/strict'
import test from 'node:test'
import { createClassResolver, hozoTextMetricStyles } from './class-resolver.ts'

test('generated font defaults lose only their line height to an active explicit write, never their font size', () => {
  const font = { fontSize: 18, lineHeight: 28 }
  const otherFont = { fontSize: 20, lineHeight: 28 }
  const leading = { lineHeight: 24 }
  const defaults = new Map([
    [font, { fontSize: 18 }],
    [otherFont, { fontSize: 20 }],
  ])
  for (const styles of [
    [leading, font],
    [font, leading],
    [otherFont, leading, font],
  ]) {
    const before = structuredClone(styles)
    const projected = hozoTextMetricStyles(styles, defaults)
    assert.equal(Object.assign({}, ...projected).lineHeight, 24)
    assert.equal(Object.assign({}, ...projected).fontSize, 18)
    assert.deepEqual(styles, before, 'generated objects are shared and must stay immutable')
    assert.ok(
      projected.some((style) => style === defaults.get(font)),
      'reuse the prepared projection, never clone it during a state update',
    )
    assert.ok(projected.every((style) => !Object.keys(style).some((key) => key.startsWith('--'))))
  }
  const onlyFonts = [font, otherFont]
  assert.equal(hozoTextMetricStyles(onlyFonts, defaults), onlyFonts)
  const ordinary = [{ paddingTop: 4 }]
  assert.equal(hozoTextMetricStyles(ordinary, defaults), ordinary)
})

test('cached text templates restore defaults after states deactivate without reading ranks again', () => {
  const font = { fontSize: 18, lineHeight: 28 }
  const focus = { lineHeight: 24 }
  const activeFont = { fontSize: 24, lineHeight: 32 }
  let rankReads = 0
  const ranks = Object.fromEntries(
    ['font', 'focus', 'activeFont'].map((name, rank) => [
      name,
      {
        get 0() {
          rankReads++
          return rank
        },
      },
    ]),
  )
  const defaults = new Map([
    [font, { fontSize: 18 }],
    [activeFont, { fontSize: 24 }],
  ])
  const resolve = createClassResolver({
    schema: 1,
    styles: { font },
    states: { focus: [[['focused'], focus]], activeFont: [[['pressed'], activeFont]] },
    ordering: { schema: 1, ranks: ranks as unknown as Record<string, number[]> },
    compose: (styles) => hozoTextMetricStyles(styles, defaults),
  })
  const classes = 'activeFont focus font'
  const resting = resolve(classes, { focused: false, pressed: false })
  assert.equal(Object.assign({}, ...resting).lineHeight, 28)
  const readOnce = rankReads
  assert.equal(readOnce, 3)
  assert.equal(
    Object.assign({}, ...resolve(classes, { focused: true, pressed: true })).lineHeight,
    24,
  )
  assert.equal(
    Object.assign({}, ...resolve(classes, { focused: true, pressed: true })).fontSize,
    24,
  )
  assert.equal(
    Object.assign({}, ...resolve(classes, { focused: false, pressed: true })).lineHeight,
    32,
  )
  assert.equal(resolve(classes, { focused: false, pressed: false }), resting)
  assert.equal(
    rankReads,
    readOnce,
    'state selection/cached strings must not inspect ordering metadata',
  )
})
