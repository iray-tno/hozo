import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoPopover, type HozoPopoverProps } from './popover.tsx'

/**
 * What this suite can and cannot reach.
 *
 * `renderToStaticMarkup` produces markup and runs no effects and no handlers, so
 * the roles, the names and the relationships are assertable and the behaviour is
 * not. Three things are therefore **not** covered here and are named rather than
 * left to be assumed:
 *
 *   * closing when focus leaves a non-modal panel (`onBlur` on the panel),
 *   * Escape with focus still on the trigger, before Tab has moved inside,
 *   * the focus trap, which is `FocusScope`'s and is covered where it lives.
 *
 * The first two are what the screen-reader harness in `examples/screen-readers`
 * exists for, and the story is what lets it reach them.
 */
const render = (props: Partial<HozoPopoverProps> = {}) =>
  renderToStaticMarkup(
    createElement(HozoPopover, {
      trigger: 'Details',
      accessibilityLabel: 'Order details',
      children: 'Two days, or four to an island.',
      ...props,
    } as HozoPopoverProps),
  )

const count = (html: string, needle: string) => html.split(needle).length - 1

test('a closed popover is a button that says it opens a dialog', () => {
  const html = render()
  assert.match(html, /aria-haspopup="dialog"/)
  assert.match(html, /aria-expanded="false"/)
  // Nothing to point at while it is closed. `aria-controls` naming an id that
  // is not in the document is a relationship a reader can follow into nothing.
  assert.doesNotMatch(html, /aria-controls/)
  assert.doesNotMatch(html, /role="dialog"/)
  assert.match(html, /data-hozo-state="closed"/)
})

test('an open popover is a named dialog the trigger points at', () => {
  const html = render({ defaultOpen: true })
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-label="Order details"/)
  const controls = /aria-controls="([^"]*)"/.exec(html)
  assert.ok(controls, 'the trigger points at nothing')
  assert.match(html, new RegExp(`id="${controls[1]}"`), 'and what it points at exists')
})

test('a popover is not modal unless it is asked to be', () => {
  // The decision the prop's comment argues: `aria-modal` takes the page away
  // from a reader, and most popovers should not. Absent rather than "false",
  // because `aria-modal="false"` is a claim where no claim is wanted.
  assert.doesNotMatch(render({ defaultOpen: true }), /aria-modal/)
  assert.match(render({ defaultOpen: true, modal: true }), /aria-modal="true"/)
})

test('a name comes from one place at a time', () => {
  // Both would be two names for one dialog, and `aria-labelledby` wins in the
  // accessible-name calculation -- so setting both means the `aria-label`
  // silently does nothing. This drops it instead.
  const html = render({ defaultOpen: true, accessibilityLabelledBy: 'title' })
  assert.match(html, /aria-labelledby="title"/)
  assert.doesNotMatch(html, /aria-label="Order details"/)
})

test('a disabled trigger says so to the platform and to a stylesheet', () => {
  // ADR 001: the real attribute, which takes it out of the tab order, plus the
  // hook Hozo's `disabled:` variant compiles to.
  const html = render({ disabled: true })
  assert.match(html, / disabled=""/)
  assert.match(html, /data-hozo-disabled=""/)
})

test('nothing carries a class it was not given', () => {
  assert.doesNotMatch(render({ defaultOpen: true }), /class="(?!z-50)/)
  const html = render({
    defaultOpen: true,
    className: 'W',
    triggerClassName: 'T',
    panelClassName: 'P',
  })
  assert.equal(count(html, 'class="W"'), 1)
  assert.equal(count(html, 'class="T"'), 1)
  assert.equal(count(html, 'class="P"'), 1)
})
