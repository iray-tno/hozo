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
  assert.match(html, /<button type="button">Save<\/button>/)
  assert.match(html, /<a href="\/docs">Docs<\/a>/)
  assert.match(html, /<div[^>]*>Open<\/div>/)
  assert.match(html, /<img src="\/avatar.png" alt="Avatar"/)
  assert.match(html, /<input[^>]*aria-label="Query"/)
})
