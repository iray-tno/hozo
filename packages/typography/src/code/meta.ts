import type { CodeMark, CodeRange } from './model.ts'

export interface CodeMeta {
  language: string
  title?: string
  wrap?: boolean
  lineNumbers?: boolean | { start: number }
  marks: CodeRange[]
  unknown: string[]
}

/** Fence metadata is data: unknown syntax is preserved, never executed. */
export function parseCodeMeta(language: string, meta = ''): CodeMeta {
  const result: CodeMeta = { language, marks: [], unknown: [] }
  const tokens = meta.match(/(?:[^\s"'{}]+|"(?:\\.|[^"\\])*"|'[^']*'|\{[^}]*\})+|\S+/g) ?? []
  let start: number | undefined
  for (const token of tokens) {
    if (token === 'wrap') {
      result.wrap = true
      continue
    }
    if (token === 'showLineNumbers') {
      result.lineNumbers = true
      continue
    }
    if (token.startsWith('title=')) {
      const value = token.slice(6)
      try {
        result.title = value.startsWith('"') ? JSON.parse(value) : value.replace(/^'|'$/g, '')
      } catch {
        result.unknown.push(token)
      }
      continue
    }
    if (/^startLineNumber=\d+$/.test(token)) {
      const value = Number(token.slice(16))
      if (Number.isSafeInteger(value)) start = value
      else result.unknown.push(token)
      continue
    }
    const range = /^(?:(ins|del)=)?\{([\d,\s-]+)\}$/.exec(token)
    if (range) {
      const mark = (range[1] ?? 'mark') as CodeMark
      const parsed: CodeRange[] = []
      for (const part of range[2]!.split(',')) {
        const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
        const from = Number(match?.[1]),
          to = Number(match?.[2] ?? match?.[1])
        if (
          !match ||
          !Number.isSafeInteger(from) ||
          !Number.isSafeInteger(to) ||
          from < 1 ||
          to < from
        ) {
          parsed.length = 0
          break
        }
        parsed.push({ from, to, mark })
      }
      if (parsed.length) result.marks.push(...parsed)
      else result.unknown.push(token)
      continue
    }
    result.unknown.push(token)
  }
  if (start !== undefined) result.lineNumbers = { start }
  return result
}
