import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Slider, type SliderProps } from './index.ts'

const render = (props: SliderProps = {}) =>
  renderToStaticMarkup(createElement(Slider, { accessibilityLabel: 'Volume', max: 10, ...props }))

test('the role and the value are on the thumb, not on the track', () => {
  // The thumb is the thing with a value and the thing that takes focus; the
  // track is where it can go. A reader announces the thumb.
  const html = render({ defaultValue: 3 })
  assert.match(html, /role="slider"/)
  assert.match(html, /aria-valuenow="3"/)
  assert.match(html, /aria-valuemin="0"/)
  assert.match(html, /aria-valuemax="10"/)
  assert.match(html, /aria-orientation="horizontal"/)
  assert.match(html, /tabindex="0"/)
  assert.equal(html.split('role="slider"').length - 1, 1, 'one of them, not two')
})

test('the value is snapped before it is announced', () => {
  // `aria-valuenow` is what a reader says. A caller handing in something off
  // the scale gets the nearest point on it rather than the number they sent.
  assert.match(render({ defaultValue: 3.7, step: 1 }), /aria-valuenow="4"/)
  assert.match(render({ defaultValue: 99 }), /aria-valuenow="10"/)
})

test('valueText is what a reader says when the number is not the answer', () => {
  // "3" is not an answer to "how loud". A scale whose points have names is
  // unusable without this.
  const html = render({ defaultValue: 3, valueText: (v) => `${v * 10} percent` })
  assert.match(html, /aria-valuetext="30 percent"/)
  assert.doesNotMatch(render({ defaultValue: 3 }), /aria-valuetext/, 'absent when not given')
})

test('a vertical slider says so and is positioned from the bottom', () => {
  const html = render({ orientation: 'vertical', defaultValue: 5 })
  assert.match(html, /aria-orientation="vertical"/)
  assert.match(html, /data-hozo-orientation="vertical"/)
  assert.match(html, /bottom:50%/)
})

test('a disabled slider leaves the tab order, and says why', () => {
  const html = render({ disabled: true })
  assert.match(html, /tabindex="-1"/)
  assert.match(html, /aria-disabled="true"/)
  assert.match(html, /data-hozo-disabled=""/)
})

test('the fill is rendered only when it was asked for, and is not announced', () => {
  // This package ships no CSS, so an empty div nobody styled is one more
  // thing in the accessibility tree for no reason. It is a picture of the
  // value rather than a second copy of it.
  assert.doesNotMatch(render({ defaultValue: 5 }), /aria-hidden/)
  const html = render({ defaultValue: 5, fillClassName: 'F' })
  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /class="F"/)
  assert.match(html, /width:50%/)
})

test('nothing carries a class it was not given', () => {
  assert.doesNotMatch(render(), /class=/)
  const html = render({ className: 'T', thumbClassName: 'H' })
  assert.match(html, /class="T"/)
  assert.match(html, /class="H"/)
})
