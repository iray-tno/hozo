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

test('maxHeight scrolls the lines inside the block on the Web, whole up to 100 lines', () => {
  const lines = Array.from({ length: 50 }, (_, at) => `line ${at}`).join('\n')
  for (const wrap of [false, true]) {
    const html = renderToStaticMarkup(createElement(CodeBlock, { lines, wrap, maxHeight: 200 }))
    // Scrolling either way makes the lines a region a keyboard can reach.
    assert.match(html, /role="region"[^>]*style="[^"]*overflow-y:auto;max-height:200px/)
    assert.ok(html.includes('line 49'), 'find-in-page still reaches the last line')
  }
})

test('a windowed block on the Web serves its first lines and holds the rest as space', () => {
  const lines = Array.from({ length: 1000 }, (_, at) => ({ tokens: `line ${at}.` }))
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(CodeBlock, { lines, maxHeight: 200, ...props }))
  const html = render({})
  assert.ok(html.includes('line 0.') && html.includes('line 39.'), 'the top of the block')
  assert.ok(!html.includes('line 40.') && !html.includes('line 999.'), 'not the other 960')
  // 960 lines at the 20px estimate, until the browser measures them.
  assert.ok(
    html.includes('<span aria-hidden="true" style="display:block;height:19200px"></span></code>'),
  )
  // Unwrapped, the widest line (the longest number) holds the width open.
  assert.match(html, /visibility:hidden"><span data-code-line="100"/)
  assert.ok(!render({ wrap: true }).includes('visibility:hidden'), 'wrapped has no width to hold')
  assert.ok(render({ windowing: 'off' }).includes('line 999.'), 'off keeps every line')
  assert.ok(
    render({ maxHeight: undefined, windowing: 'on' }).includes('line 999.'),
    'no scroller, nothing to window',
  )
})
