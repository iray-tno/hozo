import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CodeBlock } from './code-block.tsx'

test('code figure is captioned, gutters are hidden and copy is absent on the server', () => {
  const html = renderToStaticMarkup(
    createElement(CodeBlock, {
      title: 'PATH changes',
      lines: [
        { tokens: 'before', mark: 'del' },
        { tokens: 'after', mark: 'ins' },
      ],
      lineNumbers: { start: 10 },
      copy: true,
      className: 'frame-only',
    }),
  )
  assert.match(html, /<figure class="frame-only"[^>]+aria-labelledby=/)
  assert.match(html, /<figcaption[^>]*>PATH changes<\/figcaption>/)
  assert.match(html, /aria-hidden="true"[^>]*>− 10<\/span>/)
  assert.match(html, /aria-hidden="true"[^>]*>\+ 11<\/span>/)
  assert.equal((html.match(/frame-only/g) ?? []).length, 1)
  assert.ok(!html.includes('<button'))
})

test('wrapped copy-free rendering needs no scroll ref and unnamed figures have a default name', () => {
  const html = renderToStaticMarkup(
    createElement(CodeBlock, { lines: 'a\nb', wrap: true, title: '  ' }),
  )
  assert.match(html, /<figure[^>]+aria-label="Code"/)
  assert.ok(!html.includes('role="region"'))
  assert.throws(
    () =>
      renderToStaticMarkup(
        createElement(CodeBlock, { lines: '', lineNumbers: { start: Number.NaN } }),
      ),
    RangeError,
  )
})
