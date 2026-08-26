import { compileCanvasPaints, type CompileDiagnostic, type Theme } from './index.ts'

export interface LoweredCanvasPaints {
  code: string
  diagnostics: CompileDiagnostic[]
  /** True when a Canvas shape className was inspected, even if left intact. */
  touched: boolean
  changed: boolean
}

/** Applies the Canvas-only AST edits back-to-front so source offsets remain valid. */
export function lowerCanvasPaints(
  code: string,
  theme: Theme | undefined,
  native: boolean,
): LoweredCanvasPaints {
  if (!code.includes('@hozo/canvas')) {
    return { code, diagnostics: [], touched: false, changed: false }
  }
  const edits = compileCanvasPaints(code, theme, native)
  let next = code
  let changed = false
  for (const edit of [...edits].sort((a, b) => b.spanStart - a.spanStart)) {
    const original = next.slice(edit.spanStart, edit.spanEnd)
    if (original !== edit.replacement) changed = true
    next = next.slice(0, edit.spanStart) + edit.replacement + next.slice(edit.spanEnd)
  }
  return {
    code: next,
    diagnostics: edits.flatMap((edit) => edit.diagnostics),
    touched: edits.length > 0,
    changed,
  }
}
