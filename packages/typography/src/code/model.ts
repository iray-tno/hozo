export interface CodeToken {
  text: string
  color?: string | Readonly<Record<string, string>>
  italic?: boolean
  bold?: boolean
  underline?: boolean
}

export type CodeMark = 'ins' | 'del' | 'mark'

export interface CodeLine {
  tokens: string | readonly CodeToken[]
  mark?: CodeMark
}

export interface CodeRange {
  from: number
  to: number
  mark: CodeMark
}

export function codeText(lines: readonly CodeLine[] | string): string {
  return typeof lines === 'string'
    ? lines
    : lines
        .map((line) =>
          typeof line.tokens === 'string'
            ? line.tokens
            : line.tokens.map((token) => token.text).join(''),
        )
        .join('\n')
}

/** Tab stops cross token boundaries, so highlighting cannot change indentation. */
export function normalizeCodeLines(
  lines: readonly CodeLine[] | string,
  tabSize = 2,
): (Omit<CodeLine, 'tokens'> & { tokens: CodeToken[] })[] {
  if (!Number.isSafeInteger(tabSize) || tabSize < 1)
    throw new RangeError('tabSize must be a positive safe integer')
  const input: readonly CodeLine[] =
    typeof lines === 'string'
      ? lines
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .map((tokens) => ({ tokens }))
      : lines
  return input.flatMap((line) => {
    const parts = typeof line.tokens === 'string' ? [{ text: line.tokens }] : line.tokens
    const result: (Omit<CodeLine, 'tokens'> & { tokens: CodeToken[] })[] = []
    let tokens: CodeToken[] = []
    let column = 0
    for (const token of parts) {
      const pieces = token.text.replace(/\r\n?/g, '\n').split('\n')
      pieces.forEach((piece, index) => {
        if (index > 0) {
          result.push({ tokens, mark: line.mark })
          tokens = []
          column = 0
        }
        let text = ''
        for (const character of piece) {
          const expanded = character === '\t' ? ' '.repeat(tabSize - (column % tabSize)) : character
          text += expanded
          column += expanded.length
        }
        tokens.push({ ...token, text })
      })
    }
    result.push({ tokens, mark: line.mark })
    return result
  })
}

/**
 * The line that needs the most columns, for a windowed block to hold its
 * scrolling width open with before the line itself is mounted.
 *
 * The text is monospaced, so columns are the width; a wide character (CJK,
 * full-width forms, most emoji) takes two, which is approximated by code
 * point rather than read from Unicode's East Asian Width table.
 */
export function widestCodeLine<T extends Pick<CodeLine, 'tokens'>>(
  lines: readonly T[],
): { line: T; index: number } | undefined {
  let widest: { line: T; index: number; columns: number } | undefined
  lines.forEach((line, index) => {
    let columns = 0
    const tokens = typeof line.tokens === 'string' ? [{ text: line.tokens }] : line.tokens
    for (const token of tokens)
      for (const char of token.text) columns += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1
    if (!widest || columns > widest.columns) widest = { line, index, columns }
  })
  return widest
}

export function markCodeLines(
  lines: readonly CodeLine[] | string,
  ranges: readonly CodeRange[],
): CodeLine[] {
  const normalized =
    typeof lines === 'string'
      ? lines
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .map((tokens) => ({ tokens }))
      : lines
  return normalized.map((line, index) => {
    const mark = ranges.findLast((range) => range.from <= index + 1 && range.to >= index + 1)?.mark
    return mark ? { ...line, mark } : { ...line }
  })
}
