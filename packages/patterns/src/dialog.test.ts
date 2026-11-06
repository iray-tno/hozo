import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Dialog, type DialogProps } from './dialog.tsx'

// What the markup says. Opening, the exit and focus are the browser's, and
// `examples/storybook-demo/scripts/dialog-presence.test.mjs` asks one.
const render = (props: Partial<DialogProps> = {}) =>
  renderToStaticMarkup(createElement(Dialog, { onClose: () => {}, ...props }, 'Body')).match(
    /<dialog[^>]*>/,
  )?.[0] ?? ''

test('the dialog carries its state for a stylesheet and a test to read', () => {
  assert.match(render({ open: true }), / data-state="open"/)
  assert.match(render({ open: false }), / data-state="closed"/)
})

// #1715: a dialog whose heading is its name points at the heading.
test('accessibilityLabelledBy names it from an element inside, and wins over a label', () => {
  const named = render({ accessibilityLabelledBy: 'rename-title', accessibilityLabel: 'Rename' })
  assert.match(named, / aria-labelledby="rename-title"/)
  assert.doesNotMatch(named, /aria-label=/)
  assert.match(render({ accessibilityLabel: 'Rename' }), / aria-label="Rename"/)
})
