// SSR proves prop ownership, not computed cascade or browser events.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Tabs } from './tabs.tsx'

test('tabStyle reaches each actual tab box, not the strip, panel or label wrapper', () => {
  const html = renderToStaticMarkup(
    createElement(Tabs, {
      tabClassName: 'tab',
      tabListClassName: 'strip',
      panelClassName: 'panel',
      tabStyle: { paddingTop: 20, opacity: 0.8 },
      tabs: [
        { label: 'First', content: 'One' },
        { label: 'Unavailable', content: 'Two', disabled: true },
      ],
    }),
  )
  const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)]
  assert.equal(tabs.length, 2)
  for (const [tab] of tabs) {
    assert.match(tab, /class="tab"/)
    assert.match(tab, /style="padding-top:20px;opacity:0.8"/)
  }
  assert.equal((html.match(/padding-top:20px/g) ?? []).length, 2)
  assert.doesNotMatch(html, /class="(?:strip|panel)"[^>]*style=/)
  assert.match(tabs[1]![0], /disabled=""/)
})
