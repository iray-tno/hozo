import { CodeBlock } from '@hozo/patterns'
import type { CodeLine } from '@hozo/typography/code/model'
import { createElement } from 'react'

export interface DocsCodeData {
  code: string
  title: string
  language: string
  lines: CodeLine[]
  wrap?: boolean
  lineNumbers?: boolean | { start: number }
  unknown: string[]
}

/** The same component owns the initial text and hydrated Copy/overflow behavior. */
export function DocsCode({ data }: { data: DocsCodeData }) {
  return createElement(CodeBlock, {
    lines: data.lines,
    title: data.title,
    language: data.language,
    wrap: data.wrap,
    lineNumbers: data.lineNumbers,
    copy: { text: data.code },
    className: 'hozo-docs-code-figure',
    captionClassName: 'hozo-docs-code-caption',
    lineClassName: 'hozo-docs-code-line',
    gutterClassName: 'hozo-docs-code-gutter',
    insClassName: 'hozo-docs-code-ins',
    delClassName: 'hozo-docs-code-del',
    markClassName: 'hozo-docs-code-mark',
    copyClassName: 'hozo-docs-code-copy',
    lineStyle: { fontFamily: 'var(--sl-font-mono), ui-monospace, monospace', lineHeight: 1.625 },
    gutterStyle: { fontFamily: 'var(--sl-font-mono), ui-monospace, monospace', lineHeight: 1.625 },
  })
}
