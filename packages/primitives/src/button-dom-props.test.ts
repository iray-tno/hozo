import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { hozoButtonDomProps, hozoLinkDomProps } from './generated/button-dom-props.ts'
import { Button } from './index.ts'

// #1096: a compiled Button receives its spread in the primitive's words.
const onPress = () => {}
const props = {
  onPress,
  accessibilityLabel: 'Save draft',
  accessibilityHint: 'Keeps it for later',
  testID: 'save',
  nativeID: 'save-button',
  'data-step': '2',
  replace: true,
  somethingUnknown: 'x',
}

test('a spread onto the compiled <button> gets the press handler as onClick', () => {
  const dom = hozoButtonDomProps(props) as Record<string, unknown>
  assert.equal(dom.onClick, onPress)
  assert.equal(dom.onPress, undefined)
  assert.equal(dom['data-hozo-pressable'], '')
})

test('the compiled <button> matches the uncompiled Button for the same props', () => {
  const compiled = renderToStaticMarkup(
    createElement('button', { type: 'button', ...hozoButtonDomProps(props) }, 'Save'),
  )
  // The fallback also writes the view base stylesheet; the element is what is compared.
  const fallback = renderToStaticMarkup(createElement(Button, props, 'Save')).match(
    /<button[\s\S]*<\/button>/,
  )?.[0]
  const attributes = (html: string | undefined) =>
    [...(html ?? '').matchAll(/ ([\w-]+)="([^"]*)"/g)].map(([, n, v]) => `${n}=${v}`).sort()
  assert.deepEqual(attributes(compiled), attributes(fallback))
})

test('keys the spread does not hold are not set, so explicit attributes survive it', () => {
  assert.deepEqual(Object.keys(hozoButtonDomProps({ className: 'x' })), ['className'])
  assert.equal(hozoButtonDomProps(undefined), undefined)
})

test('a disabled spread disables the <button> and marks it for disabled: styles', () => {
  const dom = hozoButtonDomProps({ disabled: true }) as Record<string, unknown>
  assert.equal(dom.disabled, true)
  assert.equal(dom['data-hozo-disabled'], '')
})

test('on the compiled <a>, a press is suppressed while disabled, named or spread', () => {
  const event = {
    prevented: false,
    preventDefault() {
      this.prevented = true
    },
  }
  const enabled = hozoLinkDomProps({ onPress, accessibilityLabel: 'Docs' }) as Record<
    string,
    unknown
  >
  assert.equal(enabled.onClick, onPress)
  assert.equal(enabled['aria-label'], 'Docs')

  const named = hozoLinkDomProps({ onPress }, true) as Record<string, unknown>
  assert.notEqual(named.onClick, onPress)
  ;(named.onClick as (e: typeof event) => void)(event)
  assert.ok(event.prevented)

  const spread = hozoLinkDomProps({ onPress, disabled: true }) as Record<string, unknown>
  assert.notEqual(spread.onClick, onPress)
  assert.equal(spread['aria-disabled'], true)
  assert.equal(spread.tabIndex, -1)
  assert.equal(spread.disabled, undefined, 'an anchor has no disabled attribute')
})

// #1137: Tooltip clones its child with these to make it a trigger.
test('what a wrapper writes to make a Button a trigger reaches the element, compiled or not', () => {
  const onFocus = () => {}
  const onPointerEnter = () => {}
  const ref = { current: null }
  const trigger = { ref, onFocus, onPointerEnter, 'aria-describedby': 'tip' }
  for (const dom of [
    hozoButtonDomProps(trigger) as Record<string, unknown>,
    hozoLinkDomProps(trigger) as Record<string, unknown>,
  ]) {
    assert.equal(dom.ref, ref)
    assert.equal(dom.onFocus, onFocus)
    assert.equal(dom.onPointerEnter, onPointerEnter)
    assert.equal(dom['aria-describedby'], 'tip')
  }
  for (const href of [undefined, '/docs']) {
    const html = renderToStaticMarkup(
      createElement(Button, { href, 'aria-describedby': 'tip' }, 'Save'),
    )
    assert.match(html, /aria-describedby="tip"/)
  }
  // Still a list: the uncompiled Button does not forward other leftovers.
  const html = renderToStaticMarkup(
    createElement(Button, { onMouseMove: () => {}, title: 'x' } as never, 'Save'),
  )
  assert.doesNotMatch(html, /title=/)
})
