import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResizablePane, Splitter } from './splitter.tsx'
import { type SplitterSide, splitterKey } from './splitter-state.ts'

test('all sides and RTL move towards the expected logical edge', () => {
  for (const rtl of [false, true]) {
    for (const side of ['start', 'end', 'top', 'bottom'] as SplitterSide[]) {
      const horizontal = side === 'start' || side === 'end'
      const positive = horizontal ? (rtl ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown'
      assert.equal(splitterKey(positive, side, rtl), side === 'end' || side === 'bottom' ? -1 : 1)
      assert.equal(splitterKey(horizontal ? 'ArrowDown' : 'ArrowRight', side, rtl), null)
      assert.equal(splitterKey('Tab', side, rtl), null)
    }
  }
})

test('a standalone handle names its controlled pane and announces a clamped size', () => {
  const html = renderToStaticMarkup(
    createElement(Splitter, {
      label: 'Files',
      controls: 'files',
      min: 100,
      max: 400,
      defaultSize: 500,
    }),
  )
  for (const text of [
    'role="separator"',
    'tabindex="0"',
    'aria-controls="files"',
    'aria-label="Resize Files"',
    'aria-valuenow="400"',
    'aria-valuetext="400 pixels"',
  ])
    assert.ok(html.includes(text), text)
})

test('collapse keeps a focusable handle outside the inert named pane', () => {
  const html = renderToStaticMarkup(
    createElement(ResizablePane, {
      label: 'Files',
      side: 'end',
      min: 100,
      max: 400,
      defaultSize: 240,
      collapsible: true,
      collapsed: true,
      // biome-ignore lint/correctness/noChildrenProp: createElement requires the declared children prop.
      children: createElement('button', null, 'A file'),
    }),
  )
  assert.match(html, /<section[^>]+aria-label="Files"[^>]+inert=""/)
  assert.match(html, /--hozo-pane-size:0px/)
  assert.match(html, /aria-valuemin="0"/)
  assert.match(html, /aria-valuenow="0"/)
  assert.ok(html.indexOf('role="separator"') < html.indexOf('<section'))
})

test('non-finite and inverted bounds fail rather than emitting invalid dimensions', () => {
  for (const bounds of [
    { min: 200, max: 100 },
    { min: 0, max: Infinity },
    { min: 0, max: 100, step: 0 },
  ])
    assert.throws(
      () =>
        renderToStaticMarkup(
          createElement(Splitter, { ...bounds, label: 'Files', controls: 'files' }),
        ),
      RangeError,
    )
})
