import assert from 'node:assert/strict'
import test from 'node:test'
import { codeText } from '@hozo/typography/code/model'
import Prism from 'prismjs'
import 'prismjs/components/prism-jsx.js'
import 'prismjs/components/prism-typescript.js'
import 'prismjs/components/prism-tsx.js'
import { prismCodeLines } from '../src/lib/prism-code-lines.ts'

test('real Prism TSX/CSS tokens preserve literal source and blank lines without HTML', () => {
  for (const [language, source] of [
    ['tsx', 'const node = <Text title="<script>&">日😀本</Text>\n\n\t// end\n'],
    ['css', '.sample::before { content: "<&>"; color: red }\n'],
  ]) {
    const lines = prismCodeLines(Prism.tokenize(source!, Prism.languages[language!]!))
    assert.equal(codeText(lines), source)
    assert.ok(lines.some((line) => line.tokens.some((token) => token.color)))
    assert.ok(
      lines
        .flatMap((line) => [...line.tokens])
        .every((token) => !token.text.includes('<span class=')),
    )
  }
})

test('nested aliases and split CRLF retain physical lines and token styles', () => {
  const lines = prismCodeLines([
    {
      type: 'unknown',
      alias: ['other', 'string'],
      content: ['<tag>', { type: 'comment', content: ' text\r' }],
    },
    '\n\nend\n',
  ])
  assert.equal(codeText(lines), '<tag> text\n\nend\n')
  assert.equal(lines.length, 4)
  assert.equal(lines[0]!.tokens[0]!.color, 'var(--color-tatami-code)')
  assert.equal(lines[0]!.tokens[1]!.italic, true)
  assert.equal(lines[0]!.tokens[1]!.color, 'var(--color-stone-400)')
  assert.equal(codeText(prismCodeLines('')), '')
})
