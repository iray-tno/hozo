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

type NormalizedLine = Omit<CodeLine, 'tokens'> & { tokens: CodeToken[] }

/** Tab stops cross token boundaries, so highlighting cannot change indentation. */
export function normalizeCodeLines(
  lines: readonly CodeLine[] | string,
  tabSize = 2,
): NormalizedLine[] {
  return normalizeCodeLinesFrom(lines, tabSize, new Map())[0]
}

/**
 * @internal `normalizeCodeLines`, handing back what a line object came out as
 * in `previous` (the map the last call returned, at the same tab size) when it
 * is passed again. A renderer can then tell the lines an edit left alone from
 * the one it changed by identity (#1289); lines are read as immutable, as
 * React reads props.
 */
export function normalizeCodeLinesFrom(
  lines: readonly CodeLine[] | string,
  tabSize: number,
  previous: ReadonlyMap<CodeLine, NormalizedLine[]>,
): [NormalizedLine[], Map<CodeLine, NormalizedLine[]>] {
  if (!Number.isSafeInteger(tabSize) || tabSize < 1)
    throw new RangeError('tabSize must be a positive safe integer')
  const next = new Map<CodeLine, NormalizedLine[]>()
  if (typeof lines === 'string')
    return [
      lines
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .flatMap((tokens) => normalizeLine({ tokens }, tabSize)),
      next,
    ]
  const result = lines.flatMap((line) => {
    const normalized = next.get(line) ?? previous.get(line) ?? normalizeLine(line, tabSize)
    next.set(line, normalized)
    return normalized
  })
  return [result, next]
}

function normalizeLine(line: CodeLine, tabSize: number): NormalizedLine[] {
  const parts = typeof line.tokens === 'string' ? [{ text: line.tokens }] : line.tokens
  const result: NormalizedLine[] = []
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
}

/** A token as one theme draws it. */
export interface DrawnCodeToken {
  text: string
  color?: string
  italic?: boolean
  bold?: boolean
  underline?: boolean
}

/**
 * The tokens as `theme` draws them, with each run of neighbours that would be
 * drawn the same joined into one, so a Native line nests one `Text` per run
 * rather than per token (#1431). Highlighters split far finer than they
 * colour: punctuation, whitespace and plain identifiers often share a style.
 *
 * Only an unchanged look is joined. Colour, italic, bold and underline must
 * all match, with one exception: whitespace with no underline draws nothing,
 * so its colour is not compared. Its weight and slant still are, since a
 * font's bold or italic space is not always as wide.
 */
export function drawnCodeTokens(tokens: readonly CodeToken[], theme: string): DrawnCodeToken[] {
  const result: DrawnCodeToken[] = []
  for (const token of tokens) {
    if (!token.text) continue
    const drawn: DrawnCodeToken = {
      text: token.text,
      color:
        typeof token.color === 'string'
          ? token.color
          : (token.color?.[theme] ?? token.color?.light),
      italic: token.italic || undefined,
      bold: token.bold || undefined,
      underline: token.underline || undefined,
    }
    const last = result.at(-1)
    if (
      last &&
      last.italic === drawn.italic &&
      last.bold === drawn.bold &&
      last.underline === drawn.underline &&
      (last.color === drawn.color || (!drawn.underline && (blank(last.text) || blank(drawn.text))))
    ) {
      if (blank(last.text)) last.color = drawn.color
      last.text += drawn.text
    } else result.push(drawn)
  }
  return result
}

const blank = (text: string) => /^\s+$/.test(text)

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
