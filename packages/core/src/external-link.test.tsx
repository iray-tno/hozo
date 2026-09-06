// One rule for what `external` means, checked through both doors.
//
// `<Button href>` and `<Link href>` render the same element and used to
// derive `target` and `rel` from `external` in two hand-written copies,
// one per package. Nothing compared them, so a change to either would
// have been a divergence between two components that a reader would
// reasonably expect to agree -- and the half that would have been missed
// is `noreferrer noopener`, which is the part that stops the opened page
// reaching back through `window.opener`.
//
// They share `HozoLink` now. These are the assertions that keep the
// sharing honest: the rule itself, and the two callers arriving at the
// same attributes for the same source.

import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { Button, Link } from './index.tsx'

/** The attributes a destination gets, read back off the rendered anchor. */
function anchor(html: string) {
  return {
    target: /target="([^"]*)"/.exec(html)?.[1],
    rel: /rel="([^"]*)"/.exec(html)?.[1],
    role: /role="([^"]*)"/.exec(html)?.[1],
  }
}

test('external opens a new context and severs the opener, through either component', () => {
  const button = anchor(
    renderToStaticMarkup(
      <Button href="https://example.com" external>
        Docs
      </Button>,
    ),
  )
  const link = anchor(
    renderToStaticMarkup(
      <Link href="https://example.com" external>
        Docs
      </Link>,
    ),
  )
  assert.deepEqual(
    { target: button.target, rel: button.rel },
    { target: '_blank', rel: 'noreferrer noopener' },
  )
  assert.deepEqual(
    { target: link.target, rel: link.rel },
    { target: button.target, rel: button.rel },
  )
  // The one thing they are meant to differ on.
  assert.equal(button.role, 'button')
  assert.equal(link.role, undefined)
})

test('a hand-written _blank gets the same rel as the shorthand', () => {
  // The risk belongs to the new browsing context, not to the spelling.
  const html = renderToStaticMarkup(
    <Link href="https://example.com" target="_blank">
      Docs
    </Link>,
  )
  assert.equal(anchor(html).rel, 'noreferrer noopener')
})

test('an author who wrote a rel keeps it', () => {
  const html = renderToStaticMarkup(
    <Button href="https://example.com" external rel="me">
      Profile
    </Button>,
  )
  assert.equal(anchor(html).rel, 'me')
})

test('a same-tab link is left alone', () => {
  const html = renderToStaticMarkup(<Link href="/about">About</Link>)
  assert.deepEqual(anchor(html), { target: undefined, rel: undefined, role: undefined })
})

test('a disabled Button link is announced as unavailable and matches disabled: utilities', () => {
  // `data-hozo-disabled` rather than `:disabled`, which matches form
  // controls only -- an anchor is not one, so the utility would compile
  // and then quietly fail to match on exactly this element.
  const html = renderToStaticMarkup(
    <Button href="https://example.com" disabled>
      Docs
    </Button>,
  )
  assert.match(html, /aria-disabled="true"/)
  assert.match(html, /data-hozo-disabled=""/)
})
