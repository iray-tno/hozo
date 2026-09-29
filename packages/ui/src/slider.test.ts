/**
 * The positioning contract, which is the only thing in this package where a
 * class name and someone else's inline style have to agree.
 *
 * `@hozo/patterns` moves the thumb by writing `inset-inline-start: 40%` on it.
 * An inline inset does nothing to a statically positioned element, so a thumb
 * without `absolute` is a slider that renders, takes focus, announces the
 * right value and never moves. Nothing in a DOM snapshot says so and axe has
 * no rule for it, which is why it is asserted here.
 *
 * It is written against the render rather than the source, so it also fails if
 * the pattern stops writing the inline inset -- the other half of the same
 * agreement, and the half this package does not own.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Slider, type SliderProps } from './index.ts'

const render = (props: Partial<SliderProps> = {}) =>
  renderToStaticMarkup(
    createElement(Slider, { accessibilityLabel: 'Volume', defaultValue: 40, ...props }),
  )

/** The one element carrying `role="slider"`, as its opening tag. */
const thumbTag = (html: string): string => {
  const found = /<div[^>]*role="slider"[^>]*>/.exec(html)
  assert.ok(found, 'no element has role="slider"')
  return found[0]
}

test('the thumb is positioned, because the pattern moves it with an inline inset', () => {
  const html = render()
  const thumb = thumbTag(html)
  assert.match(thumb, /inset-inline-start:\s*40%/, 'the pattern no longer sets the inline inset')
  assert.match(
    thumb,
    /class="[^"]*\babsolute\b/,
    'the thumb is not positioned, so the inset is inert',
  )
})

test('the track establishes the containing block the thumb is positioned against', () => {
  // `absolute` on the thumb resolves against the nearest positioned ancestor.
  // Without `relative` here that is the page, and a drag would move the thumb
  // across the viewport.
  const html = render()
  assert.match(html.slice(0, html.indexOf('role="slider"')), /class="[^"]*\brelative\b/)
})

test('the fill is drawn, which on the Web means it was given a class list', () => {
  // The pattern renders the fill only when one is passed -- it ships no CSS
  // and will not add an empty div to the accessibility tree for nothing. So
  // "we passed one" and "the value is visible at all" are the same statement.
  const html = render({ defaultValue: 40 })
  assert.match(html, /aria-hidden="true"[^>]*style="width:40%"|width:\s*40%/)
})

test('a disabled slider says so on the thumb, which is what the disabled look hangs off', () => {
  // `aria-disabled:` rather than a prop of our own: the pattern already puts
  // the attribute on the thumb, and a second source of truth is one that can
  // disagree with the first.
  const html = render({ disabled: true })
  assert.match(thumbTag(html), /aria-disabled="true"/)
  assert.match(thumbTag(html), /aria-disabled:border-hozo-border-strong/)
})

test('the thumb clears the WCAG 2.5.8 target size', () => {
  // 24 by 24, which `size-6` is. A slider is the control that most invites a
  // 12px dot; #636 is the same finding about a button holding one glyph.
  assert.match(thumbTag(render()), /\bsize-6\b/)
})
