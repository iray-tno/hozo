import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { codeToTokens } from 'shiki'
import { parseCodeMeta } from './code/meta.ts'
import { codeText, markCodeLines, normalizeCodeLines } from './code/model.ts'
import { fromShiki } from './code/shiki.ts'
import { CodeLines } from './code-lines.tsx'

test('tabs span token boundaries, CRLF and empty lines retain source positions', () => {
  const lines = normalizeCodeLines(
    [{ tokens: [{ text: 'a', bold: true }, { text: '\tb\r\n\tc' }] }],
    4,
  )
  assert.deepEqual(
    lines.map((line) => line.tokens.map((token) => token.text).join('')),
    ['a   b', '    c'],
  )
  assert.equal(lines[0]?.tokens[0]?.bold, true)
  assert.equal(normalizeCodeLines('a\r\n\r\nb\n').length, 4)
  assert.throws(() => normalizeCodeLines('', 0), RangeError)
  assert.equal(
    codeText([
      { tokens: 'old', mark: 'del' },
      { tokens: [{ text: 'new' }], mark: 'ins' },
    ]),
    'old\nnew',
  )
})

test('a line passed again as the same object normalizes to the same objects', () => {
  const kept = { tokens: '\tkept' }
  const split = { tokens: 'one\ntwo' }
  const before = normalizeCodeLines([kept, split, { tokens: 'old' }])
  const after = normalizeCodeLines([kept, split, { tokens: 'new' }])
  assert.equal(after[0], before[0])
  assert.equal(after[1], before[1])
  assert.equal(after[2], before[2])
  assert.notEqual(after[3], before[3])
  // Per tab size, so a different size is not served the other's columns.
  assert.equal(normalizeCodeLines([kept], 4)[0]?.tokens[0]?.text, '    kept')
  assert.equal(normalizeCodeLines([kept])[0], before[0])
})

test('Shiki 4.4.3 real single/multiple theme tokens preserve text and colour slots', async () => {
  const source = 'const answer = "<script>"\n'
  const single = await codeToTokens(source, { lang: 'ts', theme: 'github-light' })
  assert.equal(codeText(fromShiki(single.tokens)), source)
  assert.equal(
    normalizeCodeLines(fromShiki(single.tokens))[0]?.tokens[0]?.color,
    single.tokens[0]?.[0]?.color,
  )
  const dual = await codeToTokens(source, {
    lang: 'ts',
    themes: { light: 'github-light', dark: 'github-dark' },
  })
  const converted = fromShiki(dual.tokens, { themes: { light: 'light', dark: 'dark' } })
  assert.equal(codeText(converted), source)
  assert.equal(
    normalizeCodeLines(fromShiki(dual.tokens))[0]?.tokens[0]?.color,
    dual.tokens[0]?.[0]?.htmlStyle?.color,
  )
  assert.deepEqual(normalizeCodeLines(converted)[0]?.tokens[0]?.color, {
    light:
      dual.tokens[0]?.[0]?.htmlStyle?.['--shiki-light'] ??
      dual.tokens[0]?.[0]?.color ??
      dual.tokens[0]?.[0]?.htmlStyle?.color,
    dark: dual.tokens[0]?.[0]?.htmlStyle?.['--shiki-dark'],
  })
  assert.deepEqual(fromShiki([[{ content: 'x', fontStyle: 15 }]])[0]?.tokens, [
    { text: 'x', italic: true, bold: true, underline: true },
  ])
  assert.deepEqual(fromShiki([[{ content: 'x', fontStyle: -1 }]])[0]?.tokens, [{ text: 'x' }])
})

test('fence metadata preserves unknown syntax and uses bounded intervals for large ranges', () => {
  const meta = parseCodeMeta(
    'tsx',
    'title="App file.tsx" {1,3-5} ins={4} del={2} showLineNumbers startLineNumber=10 wrap future=value',
  )
  assert.equal(meta.title, 'App file.tsx')
  assert.deepEqual(meta.lineNumbers, { start: 10 })
  assert.equal(meta.wrap, true)
  assert.deepEqual(meta.unknown, ['future=value'])
  assert.deepEqual(
    markCodeLines('a\nb\nc\nd', meta.marks).map((line) => line.mark),
    ['mark', 'del', 'mark', 'ins'],
  )
  assert.deepEqual(parseCodeMeta('text', '{1-9007199254740991}').marks, [
    { from: 1, to: Number.MAX_SAFE_INTEGER, mark: 'mark' },
  ])
  assert.deepEqual(parseCodeMeta('text', '{0} {4-2} ins={x}').unknown, ['{0}', '{4-2}', 'ins={x}'])
})

test('unrecognized braces remain available to a future metadata consumer', () => {
  assert.deepEqual(parseCodeMeta('text', '{ future }').unknown, ['{ future }'])
  assert.deepEqual(parseCodeMeta('text', '{').unknown, ['{'])
})

test('server rendering escapes tokens and marks have one spoken prefix without marker glyphs', () => {
  const html = renderToStaticMarkup(
    <CodeLines
      lines={[
        { tokens: '<script>&', mark: 'ins' },
        { tokens: 'old', mark: 'del' },
        { tokens: '', mark: 'mark' },
      ]}
    />,
  )
  assert.match(html, /<pre[^>]*><code/)
  for (const tag of ['ins', 'del', 'mark'])
    assert.match(html, new RegExp(`<${tag}[^>]*data-code-mark="${tag}"`))
  assert.ok(html.includes('&lt;script&gt;&amp;'))
  assert.equal((html.match(/Added: /g) ?? []).length, 1)
  assert.ok(!html.includes('\u200b'))
  assert.ok(!html.includes('<script>'))
})
