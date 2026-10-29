import { type ReactNode, useRef } from 'react'
import { type CodeLine, normalizeCodeLinesFrom } from './model.ts'

type NormalizedCodeLine = ReturnType<typeof normalizeCodeLinesFrom>[0][number]

/**
 * @internal `normalizeCodeLines`, keeping a line's normalized objects from the
 * last render while the same line object is passed.
 */
export function useNormalizedCodeLines(
  lines: readonly CodeLine[] | string,
  tabSize = 2,
): NormalizedCodeLine[] {
  const last = useRef<{ tabSize: number; byLine: ReadonlyMap<CodeLine, NormalizedCodeLine[]> }>(
    undefined,
  )
  const [result, byLine] = normalizeCodeLinesFrom(
    lines,
    tabSize,
    last.current?.tabSize === tabSize ? last.current.byLine : new Map(),
  )
  last.current = { tabSize, byLine }
  return result
}

/**
 * @internal Rows already drawn, by line object. A line an edit left alone
 * comes back from `useNormalizedCodeLines` as the same object, and is handed
 * back here as the same element, which React skips; without this, changing
 * one line re-rendered every mounted one (#1289). A `FlatList` asks for rows
 * after the render too, so the map outlives it, holding only the current
 * lines. `key` is everything else a row is drawn from; `undefined` reuses
 * nothing.
 */
export function useCodeRows<Line extends object>(
  lines: readonly Line[],
  key: string | undefined,
  draw: (line: Line, index: number) => ReactNode,
): (line: Line, index: number) => ReactNode {
  const drawn = useRef<{
    lines?: readonly Line[]
    rows: Map<Line, { index: number; key: string; row: ReactNode }>
  }>({ rows: new Map() })
  if (drawn.current.lines !== lines) {
    const rows: typeof drawn.current.rows = new Map()
    for (const line of lines) {
      const hit = drawn.current.rows.get(line)
      if (hit) rows.set(line, hit)
    }
    drawn.current = { lines, rows }
  }
  const { rows } = drawn.current
  return (line, index) => {
    if (key === undefined) return draw(line, index)
    const hit = rows.get(line)
    if (hit && hit.index === index && hit.key === key) return hit.row
    const row = draw(line, index)
    rows.set(line, { index, key, row })
    return row
  }
}

/** @internal JSON for a row key, or `undefined` for a value it cannot write out. */
export function codeKey(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}
