import type { CodeToken } from '@hozo/typography/code/model'

interface PrismToken {
  type: string
  alias?: string | string[]
  content: PrismStream
}
type PrismStream = string | PrismToken | PrismStream[]

const colors: Record<string, string> = {
  comment: 'var(--color-stone-400)',
  keyword: 'var(--color-hinoki)',
  string: 'var(--color-tatami-code)',
  char: 'var(--color-tatami-code)',
  function: 'var(--color-hinoki-light)',
  'class-name': 'var(--color-hinoki-light)',
  tag: 'var(--color-hinoki-light)',
  number: 'var(--color-hinoki-light)',
  boolean: 'var(--color-hinoki-light)',
  punctuation: 'var(--color-shikkui-muted)',
  operator: 'var(--color-shikkui-muted)',
}

/** Prism stays application-owned; CodeBlock receives text/styles, never its HTML. */
export function prismCodeLines(stream: PrismStream): { tokens: CodeToken[] }[] {
  const lines: { tokens: CodeToken[] }[] = [{ tokens: [] }]
  const visit = (value: PrismStream, style: Omit<CodeToken, 'text'> = {}) => {
    if (typeof value === 'string') {
      for (const [index, text] of value.split('\n').entries()) {
        if (index) {
          // A CRLF can straddle two nested highlighter tokens.
          const previous = lines.at(-1)!.tokens.at(-1)
          if (previous?.text.endsWith('\r')) previous.text = previous.text.slice(0, -1)
          lines.push({ tokens: [] })
        }
        if (text) lines.at(-1)!.tokens.push({ ...style, text })
      }
    } else if (Array.isArray(value)) {
      for (const child of value) visit(child, style)
    } else {
      const names = [value.type, ...[value.alias ?? []].flat()]
      const name = names.find((candidate) => Object.hasOwn(colors, candidate))
      visit(value.content, {
        ...style,
        ...(name ? { color: colors[name] } : {}),
        ...(value.type === 'comment' ? { italic: true } : {}),
      })
    }
  }
  visit(stream)
  return lines
}
