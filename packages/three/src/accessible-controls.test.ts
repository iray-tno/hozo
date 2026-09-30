import assert from 'node:assert/strict'
import test from 'node:test'
import type { FocusEvent } from 'react'

import { accessibleOnlyStyle, focusLeft, revealedControlsStyle } from './accessible-controls.ts'

/**
 * A `blur` whose focus is going to `next`, which is all `focusLeft` reads.
 *
 * `currentTarget` needs a real `contains`, so this is a pair of nodes rather
 * than an object with the right shape: the distinction being tested is whether
 * the strip still holds the element focus moved to.
 */
function blur(strip: { contains: (node: Node) => boolean }, next: unknown) {
  return { currentTarget: strip, relatedTarget: next } as unknown as FocusEvent<HTMLElement>
}

const strip = { contains: (node: Node) => (node as { inside?: boolean }).inside === true }

/** Anything with a `nodeType`, which is what `focusLeft` asks for. */
const element = (inside: boolean) => ({ nodeType: 1, inside })

test('focus moving between two controls in the strip has not left it', () => {
  // The case that made this a function rather than `() => setReached(false)`:
  // `blur` fires on every hop, so hiding on any blur makes the strip vanish
  // under the second Tab, while focus is still inside it.
  assert.equal(focusLeft(blur(strip, element(true))), false)
})

test('focus moving to anything outside the strip has left it', () => {
  assert.equal(focusLeft(blur(strip, element(false))), true)
})

test('focus leaving the document has left it', () => {
  // `relatedTarget` is null when focus goes to the browser's chrome or to
  // nothing. That is a departure, and the strip hides.
  assert.equal(focusLeft(blur(strip, null)), true)
})

test('the two styles differ in whether anything can be seen', () => {
  // The resting one is the off-screen idiom. The revealed one has to be *not*
  // that, and the assertion is about the clip rather than about the layout,
  // because the clip is what made a focused control invisible (#689).
  assert.equal(accessibleOnlyStyle.clip, 'rect(0, 0, 0, 0)')
  assert.equal(revealedControlsStyle.clip, undefined)
  assert.equal(revealedControlsStyle.position, 'absolute')
})

test('the revealed strip uses the colours a user agent guarantees', () => {
  // `Canvas` and `CanvasText` rather than a palette: this package ships no CSS
  // and has no theme to read, and in forced-colors mode a hard-coded pair would
  // be overridden anyway. An application that wants its own look passes
  // `controlClassName`.
  assert.equal(revealedControlsStyle.background, 'Canvas')
  assert.equal(revealedControlsStyle.color, 'CanvasText')
})
