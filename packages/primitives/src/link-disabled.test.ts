import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button, Link, Pressable } from './index.ts'
import { HozoLink } from './link.ts'

test('every fallback destination is unavailable and outside the Tab order when disabled', () => {
  const props = { href: '/docs', disabled: true }
  for (const element of [
    createElement(Button, props, 'Docs'),
    createElement(Link, props, 'Docs'),
    createElement(Pressable, props, 'Docs'),
  ]) {
    const html = renderToStaticMarkup(element)
    assert.match(html, /^<a\b/)
    assert.match(html, /aria-disabled="true"/)
    assert.match(html, /data-hozo-disabled=""/)
    assert.match(html, /tabindex="-1"/)
    assert.doesNotMatch(html, /\sdisabled=/)
    assert.doesNotMatch(html, /role="button"/)
  }
})

test('disabled clamps authored tab order, and reenabling restores exactly the authored override', () => {
  for (const tabIndex of [undefined, -1, 0, 3]) {
    for (const disabled of [true, false, true, false]) {
      const element = HozoLink({ href: '/docs', disabled, tabIndex })
      assert.equal(element.props.tabIndex, disabled ? -1 : tabIndex)
    }
  }
  assert.equal(HozoLink({ href: '/docs', focusable: false }).props.tabIndex, -1)
  assert.equal(HozoLink({ href: '/docs', focusable: true, disabled: true }).props.tabIndex, -1)
})

test('disabled primary and auxiliary activation cannot call authored handlers or follow href', () => {
  let presses = 0
  const onPress = () => presses++
  for (const disabled of [true, false, true, false]) {
    const element = HozoLink({ href: '/docs', disabled, onPress, onAuxClick: onPress })
    for (const name of ['onClick', 'onAuxClick'] as const) {
      let prevented = false
      const before = presses
      element.props[name]?.({ preventDefault: () => (prevented = true) } as never)
      assert.equal(prevented, disabled)
      assert.equal(presses, before + (disabled ? 0 : 1))
    }
  }
})
