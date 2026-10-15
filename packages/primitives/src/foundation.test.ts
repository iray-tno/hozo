import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Button, Image, Link, Pressable, Text, TextInput, View } from './index.ts'

test('the canonical package directly renders every foundational Web primitive', () => {
  const html = renderToStaticMarkup(
    createElement(
      View,
      { accessibilityLabel: 'Card' },
      createElement(Text, null, 'Body'),
      createElement(Button, { onPress() {} }, 'Save'),
      createElement(Link, { href: '/docs' }, 'Docs'),
      createElement(Pressable, { onPress() {} }, 'Open'),
      createElement(Image, { src: '/avatar.png', alt: 'Avatar' }),
      createElement(TextInput, { accessibilityLabel: 'Query' }),
    ),
  )

  assert.match(html, /<div[^>]*aria-label="Card"/)
  assert.match(html, /<span>Body<\/span>/)
  assert.match(html, /<button type="button" data-hozo-pressable="">Save<\/button>/)
  assert.match(html, /<a href="\/docs">Docs<\/a>/)
  assert.match(html, /<div[^>]*>Open<\/div>/)
  assert.match(html, /<img src="\/avatar.png" alt="Avatar"/)
  assert.match(html, /<input[^>]*aria-label="Query"/)
  assert.match(html, /<div class="hozo-view"/)
  assert.match(html, /data-href="hozo-view-base"/)
})

test('Button keeps typed host IDs and scalar DOM metadata on its actual action or navigation host', () => {
  for (const href of [undefined, '/docs']) {
    const html = renderToStaticMarkup(
      createElement(
        Button,
        {
          href,
          nativeID: 'winget-copy',
          testID: 'copy-test',
          disabled: true,
          'data-copy-label': 'コピー',
          'data-copied-label': '完了',
          'data-attempt': 3,
          'data-ready': false,
        },
        'Copy',
      ),
    )
    assert.match(html, href ? /<a\b/ : /<button\b/)
    assert.match(html, /id="winget-copy"/)
    assert.match(html, /data-testid="copy-test"/)
    assert.match(html, /data-copy-label="コピー"/)
    assert.match(html, /data-copied-label="完了"/)
    assert.match(html, /data-attempt="3"/)
    assert.match(html, /data-ready="false"/)
    assert.match(html, href ? /aria-disabled="true"/ : /disabled=""/)
    if (!href) assert.match(html, /type="button"/)
  }
})
