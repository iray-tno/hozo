import assert from 'node:assert/strict'
import test from 'node:test'
import { TooltipGroupProvider } from '@hozo/behaviors'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Tooltip } from './index.ts'

test('Tooltip renders its trigger while closed', () => {
  const html = renderToStaticMarkup(
    createElement(
      Tooltip,
      { content: 'Helpful info', defaultOpen: false },
      createElement('button', { type: 'button' }, 'Hover me'),
    ),
  )
  assert(html.includes('Hover me'))
  assert(!html.includes('Helpful info'))
})

test('Tooltip renders content and connects its description while open', () => {
  const html = renderToStaticMarkup(
    createElement(
      TooltipGroupProvider,
      null,
      createElement(
        Tooltip,
        { content: 'Helpful info', open: true, portal: false, contentId: 'test-tooltip' },
        createElement('button', { type: 'button' }, 'Hover me'),
      ),
    ),
  )
  assert(html.includes('Helpful info'))
  assert(html.includes('aria-describedby="test-tooltip"'))
})
