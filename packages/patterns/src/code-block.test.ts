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
  const [readable = '', rows] = html.split('<pre aria-hidden="true"')
  assert.ok(rows, 'the drawn rows are hidden from reading')
  assert.ok(rows.includes('line 0.') && rows.includes('line 39.'), 'the top of the block')
  assert.ok(!rows.includes('line 40.') && !rows.includes('line 999.'), 'not the other 960')
  // A screen reader does not scroll the block, so it reads every line here.
  assert.equal(
    (readable.match(/<span style="display:block">line \d+\.<\/span>/g) ?? []).length,
    1000,
  )
  assert.match(readable, /<pre dir="ltr" style="[^"]*white-space:pre;user-select:none/)
  // 960 lines at the 20px estimate, until the browser measures them.
  assert.ok(
    html.includes('<span aria-hidden="true" style="display:block;height:19200px"></span></code>'),
  )
  // Unwrapped, the widest line (the longest number) holds the width open.
  assert.match(html, /visibility:hidden"><span data-code-line="100"/)
  assert.ok(!render({ wrap: true }).includes('visibility:hidden'), 'wrapped has no width to hold')
  const marked = render({
    lines: lines.map((line, at) => (at === 500 ? { ...line, mark: 'ins' } : line)),
  })
  assert.ok(marked.includes('<span style="display:block">Added: line 500.</span>'), 'with its mark')
  const whole = render({ windowing: 'off' })
  assert.ok(whole.includes('line 999.'), 'off keeps every line')
  assert.ok(!whole.includes('aria-hidden="true" dir'), 'and reads them where they are drawn')
  assert.equal(whole.match(/<pre/g)?.length, 1)
  assert.ok(
    render({ maxHeight: undefined, windowing: 'on' }).includes('line 999.'),
    'no scroller, nothing to window',
  )
})
