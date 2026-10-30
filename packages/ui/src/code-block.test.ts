import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { CodeBlock, type CodeBlockProps, CodeClipboardProvider } from './index.ts'

const render = (props: Partial<CodeBlockProps> = {}) =>
  renderToStaticMarkup(
    createElement(
      CodeClipboardProvider,
      { value: { writeText: async () => {} } } as never,
      createElement(CodeBlock, {
        title: 'paths.ts',
        lineNumbers: true,
        copy: true,
        lines: [
          { tokens: 'const paths = [' },
          { tokens: '  "old/bin",', mark: 'del' },
          { tokens: '  "tools/bin",', mark: 'ins' },
          { tokens: '  "shared/bin",', mark: 'mark' },
          { tokens: ']' },
        ],
        ...props,
      }),
    ),
  )

test('the caption bar, gutter divider, and top-end copy control use shared UI surface tokens', () => {
  const html = render()
  // The figure establishes the positioning context for the top-end copy control.
  assert.match(html, /<figure[^>]*class="[^"]*\brelative\b[^"]*\brounded-hozo-surface\b/)
  // The caption header bar sits on a sunken surface with inline-end room for Copy.
  assert.match(
    html,
    /<figcaption[^>]*class="[^"]*\bborder-b\b[^"]*\bbg-hozo-surface-sunken\b[^"]*\bpe-24\b[^"]*\bfont-mono\b/,
  )
  // The gutter separates line numbers and mark glyphs from the code column.
  assert.match(
    html,
    /<span aria-hidden="true"[^>]*class="[^"]*\bselect-none\b[^"]*\bborder-e\b[^"]*\bborder-hozo-border-subtle\b/,
  )
  // The copy button is a neutral surface control anchored in the header bar, with reduced-motion fallback.
  assert.match(
    html,
    /<button type="button"[^>]*class="[^"]*\babsolute\b[^"]*\btop-2\b[^"]*\bend-2\b[^"]*\brounded-hozo-inset\b[^"]*\bbg-hozo-surface\b[^"]*\btransition-colors\b[^"]*\bmotion-reduce:transition-none\b/,
  )
})

test('caller classes join every CodeBlock slot rather than replacing the defaults', () => {
  const html = render({
    className: 'FRAME',
    captionClassName: 'CAPTION',
    lineClassName: 'LINE',
    gutterClassName: 'GUTTER',
    insClassName: 'INS',
    delClassName: 'DEL',
    markClassName: 'MARK',
    copyClassName: 'COPY',
  })
  assert.match(html, /<figure[^>]*class="[^"]*\bshadow-hozo-surface\b FRAME"/)
  assert.match(html, /<figcaption[^>]*class="[^"]*\bbg-hozo-surface-sunken\b[^"]* CAPTION"/)
  assert.match(html, /class="px-3 leading-6 LINE"/)
  assert.match(html, /class="[^"]*\bborder-hozo-border-subtle\b[^"]* GUTTER"/)
  assert.match(html, /<ins[^>]*class="[^"]*\bbg-hozo-code-insert-bg\b[^"]* INS"/)
  assert.match(html, /<del[^>]*class="[^"]*\bbg-hozo-code-delete-bg\b[^"]* DEL"/)
  assert.match(html, /<mark[^>]*class="[^"]*\bbg-hozo-code-highlight-bg\b[^"]* MARK"/)
  assert.match(
    html,
    /<button type="button"[^>]*class="[^"]*\bfocus-visible:outline-hozo-focus\b COPY"/,
  )
})
