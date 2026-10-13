import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HozoCheckbox, HozoSwitch } from './toggle.tsx'

test('checkbox state paints real, hidden slots from the state the pattern announces', () => {
  for (const checked of [false, true, 'mixed'] as const) {
    const html = renderToStaticMarkup(createElement(HozoCheckbox, { checked }, 'Updates'))
    assert.match(html, new RegExp(`aria-checked="${checked}"`))
    assert.match(html, /<span aria-hidden="true"/)
    assert.match(html, /start-2 top-3/)
    assert.match(html, /Updates<\/button>/)
    assert.doesNotMatch(html, /before:|after:|data-\[hozo-state/)
    if (checked === 'mixed') assert.match(html, /h-1 w-2 bg-hozo-accent-text/)
    else if (checked) assert.match(html, /rotate-45 border-b-2 border-r-2 border-hozo-on-accent/)
    else assert.doesNotMatch(html, /rotate-45|h-1 w-2/)
  }
})

test('defaultChecked paints the uncontrolled state and disabled still has a visible mark', () => {
  const mixed = renderToStaticMarkup(
    createElement(HozoCheckbox, { defaultChecked: 'mixed', disabled: true }, 'All'),
  )
  assert.match(mixed, /aria-checked="mixed"/)
  assert.match(mixed, /disabled=""/)
  assert.match(mixed, /h-1 w-2 bg-hozo-text-subtle/)
  const checked = renderToStaticMarkup(
    createElement(HozoCheckbox, { defaultChecked: true, disabled: true }, 'All'),
  )
  assert.match(checked, /rotate-45 border-b-2 border-r-2 border-hozo-text-subtle/)
})

test('switch state moves its real knob with a logical inset on either platform', () => {
  for (const checked of [false, true]) {
    const html = renderToStaticMarkup(createElement(HozoSwitch, { checked }, 'Sound'))
    assert.match(html, /role="switch"/)
    assert.match(html, /<span aria-hidden="true"/)
    assert.match(html, checked ? /absolute start-4 top-1 size-2/ : /absolute start-1 top-1 size-2/)
    assert.doesNotMatch(html, /translate-x|before:|after:/)
    assert.match(html, /Sound<\/button>/)
  }
})
