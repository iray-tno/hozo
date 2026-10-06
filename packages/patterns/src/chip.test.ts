import assert from 'node:assert/strict'
import test from 'node:test'
import { HozoI18nProvider } from '@hozo/behaviors'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Chip } from './index.ts'

// biome-ignore lint/suspicious/noExplicitAny: a test passes whichever props a case needs
const render = (props: any, label = 'Remote') =>
  renderToStaticMarkup(createElement(Chip as never, props, label))

test('a chip that does nothing is a label, with nothing to press', () => {
  assert.equal(render({ className: 'c' }), '<span class="c">Remote</span>')
})

test('a selectable chip is a toggle button that says whether it is pressed', () => {
  const off = render({ defaultSelected: false, className: 'c' })
  assert.match(off, /^<button type="button" aria-pressed="false"/)
  assert.match(off, /data-hozo-state="unselected"/)
  assert.match(off, /class="c"/)
  const on = render({ selected: true })
  assert.match(on, /aria-pressed="true"/)
  assert.match(on, /data-hozo-state="selected"/)
})

test('a removable chip has its own remove button, named for what it removes', () => {
  const html = render({ onRemove: () => {} })
  assert.match(html, /^<span>Remote<button type="button" aria-label="Remove Remote">/)
  assert.match(html, /<span aria-hidden="true">×<\/span>/, 'the icon is not what is read')
})

test('selectable and removable are two buttons, not one with two meanings', () => {
  const html = render({ selected: false, onRemove: () => {}, className: 'c' })
  assert.equal((html.match(/<button/g) ?? []).length, 2)
  assert.match(
    html,
    /^<span class="c" data-hozo-state="unselected"><button type="button" aria-pressed="false"/,
  )
})

test('the remove button speaks the project’s language', () => {
  const html = renderToStaticMarkup(
    createElement(
      HozoI18nProvider,
      {
        value: {
          translate: (key: string, params: Record<string, string | number>) =>
            key === 'hozo.chip.remove' ? `${params.label}を削除` : '',
        },
      },
      createElement(Chip as never, { onRemove: () => {} }, 'リモート'),
    ),
  )
  assert.match(html, /aria-label="リモートを削除"/)
})

test('an accessibilityLabel names a chip whose label is not text', () => {
  const html = render({ onRemove: () => {}, accessibilityLabel: 'Remote' }, undefined)
  assert.match(html, /aria-label="Remove Remote"/)
})
