import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DismissableLayer, FloatingPositioner, LiveRegion, Portal } from './index.ts'

test('LiveRegion renders polite status region with visually hidden styles', () => {
  const html = renderToStaticMarkup(
    createElement(LiveRegion, { mode: 'polite' }, 'File saved successfully'),
  )
  assert(html.includes('role="status"'), `Expected role="status", got: ${html}`)
  assert(html.includes('aria-live="polite"'), `Expected aria-live="polite", got: ${html}`)
  assert(html.includes('aria-atomic="true"'), `Expected aria-atomic="true", got: ${html}`)
  assert(html.includes('File saved successfully'), `Expected message content, got: ${html}`)
})

test('LiveRegion renders assertive alert region when mode is assertive', () => {
  const html = renderToStaticMarkup(
    createElement(LiveRegion, { mode: 'assertive' }, 'Connection lost'),
  )
  assert(html.includes('role="alert"'), `Expected role="alert", got: ${html}`)
  assert(html.includes('aria-live="assertive"'), `Expected aria-live="assertive", got: ${html}`)
})

test('Portal renders children inline when disabled=true', () => {
  const html = renderToStaticMarkup(createElement(Portal, { disabled: true }, 'Direct content'))
  assert.equal(html, 'Direct content')
})

test('DismissableLayer renders children in a container', () => {
  const html = renderToStaticMarkup(createElement(DismissableLayer, null, 'Modal dialog'))
  assert(html.includes('Modal dialog'), `Expected layer content, got: ${html}`)
})

test('FloatingPositioner renders children and accepts anchorRef', () => {
  const mockAnchorRef = { current: null }
  const html = renderToStaticMarkup(
    createElement(
      FloatingPositioner,
      { anchorRef: mockAnchorRef, className: 'popover-content' },
      'Floating content',
    ),
  )
  assert(html.includes('Floating content'), `Expected floating content, got: ${html}`)
  assert(html.includes('popover-content'), `Expected className, got: ${html}`)
  assert(!html.includes('popover='), 'other positioning consumers stay inline by default')
})

test('FloatingPositioner top layer reuses the host and neutralizes only the UA panel box', () => {
  const html = renderToStaticMarkup(
    createElement(
      FloatingPositioner,
      {
        anchorRef: { current: null },
        topLayer: true,
        style: { color: 'red', padding: 3 },
      },
      'Panel',
    ),
  )
  assert.equal((html.match(/<div/g) ?? []).length, 1)
  assert.match(html, /popover="manual"/)
  assert.match(html, /color:red/)
  assert.match(html, /padding:3px/)
  assert.match(html, /visibility:hidden/)
  assert.match(html, /margin:0/)
  assert.match(html, /background:transparent/)
})
