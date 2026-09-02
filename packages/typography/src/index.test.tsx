import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  Code,
  Del,
  Emphasis,
  Heading,
  Mark,
  NoBreak,
  Paragraph,
  Rt,
  Ruby,
  Small,
  Strikethrough,
  Strong,
  Sub,
  Sup,
  Text,
  Underline,
} from './index.tsx'

test('typography primitives render semantic HTML tags', () => {
  const html = renderToStaticMarkup(
    <div>
      <Heading level={1}>Heading 1</Heading>
      <Heading level={3}>Heading 3</Heading>
      <Paragraph>
        <Text>Regular text</Text>
        <Strong>Bold</Strong>
        <Emphasis>Italic</Emphasis>
        <Underline>Underlined</Underline>
        <Strikethrough>Strikethrough</Strikethrough>
        <Del>Deleted</Del>
        <Sub>Subscript</Sub>
        <Sup>Superscript</Sup>
        <Code>const x = 1;</Code>
        <Small>Fine print</Small>
        <Mark>Highlighted</Mark>
        <NoBreak>No Break Text</NoBreak>
        <Ruby>
          漢字<Rt>かんじ</Rt>
        </Ruby>
      </Paragraph>
    </div>,
  )

  assert.ok(html.includes('<h1>Heading 1</h1>'), 'Heading level 1 rendered as h1')
  assert.ok(html.includes('<h3>Heading 3</h3>'), 'Heading level 3 rendered as h3')
  assert.ok(html.includes('<p>'), 'Paragraph rendered as p')
  assert.ok(html.includes('<span>Regular text</span>'), 'Text rendered as span')
  assert.ok(html.includes('<strong>Bold</strong>'), 'Strong rendered as strong')
  assert.ok(html.includes('<em>Italic</em>'), 'Emphasis rendered as em')
  assert.ok(html.includes('<u>Underlined</u>'), 'Underline rendered as u')
  assert.ok(html.includes('<s>Strikethrough</s>'), 'Strikethrough rendered as s')
  assert.ok(html.includes('<s>Deleted</s>'), 'Del rendered as s')
  assert.ok(html.includes('<sub>Subscript</sub>'), 'Sub rendered as sub')
  assert.ok(html.includes('<sup>Superscript</sup>'), 'Sup rendered as sup')
  assert.ok(html.includes('<code>const x = 1;</code>'), 'Code rendered as code')
  assert.ok(html.includes('<small>Fine print</small>'), 'Small rendered as small')
  assert.ok(html.includes('<mark>Highlighted</mark>'), 'Mark rendered as mark')
  assert.ok(html.includes('white-space:nowrap'), 'NoBreak contains white-space:nowrap style')
  assert.ok(
    html.includes('<ruby>漢字<rt>かんじ</rt></ruby>'),
    'Ruby and Rt render semantic ruby tags',
  )
})

test('typography primitives forward accessibility labels as aria-label', () => {
  const html = renderToStaticMarkup(
    <Ruby accessibilityLabel="かんじ">
      漢字<Rt>かんじ</Rt>
    </Ruby>,
  )
  assert.ok(html.includes('aria-label="かんじ"'), 'Ruby forwards accessibilityLabel to aria-label')
})
