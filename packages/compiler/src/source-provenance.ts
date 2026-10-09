/** An edit issued by the actual lowering stage; coordinates are its input's UTF-16 offsets. */
export interface SourceEdit {
  spanStart: number
  spanEnd: number
  replacement: string
  /** Verified copies in this input; emitted offsets are relative to replacement. */
  copies?: SourceCopy[]
}

export interface SourceCopy {
  spanStart: number
  spanEnd: number
  emittedStart: number
  emittedEnd: number
}

export type SourceEvidence = 'unchanged-module-run' | 'backend-copied-run'

interface Piece {
  start: number
  end: number
  authoredStart?: number
  evidence?: SourceEvidence
}

/**
 * Only unchanged runs retain authored coordinates. Generated replacement text
 * acquires provenance only from explicit, validated backend copy ranges, never
 * just because it resembles an authored identifier. This is not a fuzzy diff
 * or an inferred map of arbitrary generated JSX.
 */
export class SourceProvenance {
  private pieces: Piece[]
  private input: string
  private valid = true

  constructor(source: string) {
    this.input = source
    this.pieces = [{ start: 0, end: source.length, authoredStart: 0 }]
  }

  apply(input: string, edits: readonly SourceEdit[]): void {
    if (!this.valid || input !== this.input) {
      this.valid = false
      return
    }
    let cursor = 0
    let length = 0
    let next = ''
    const pieces: Piece[] = []
    const carry = (end: number) => {
      for (const piece of this.pieces) {
        const from = Math.max(cursor, piece.start)
        const to = Math.min(end, piece.end)
        if (from >= to) continue
        pieces.push({
          start: length + from - cursor,
          end: length + to - cursor,
          ...(piece.authoredStart !== undefined
            ? { authoredStart: piece.authoredStart + from - piece.start, evidence: piece.evidence }
            : {}),
        })
      }
      next += input.slice(cursor, end)
      length += end - cursor
    }
    for (const edit of [...edits].sort((a, b) => a.spanStart - b.spanStart)) {
      if (
        edit.spanStart < cursor ||
        edit.spanEnd < edit.spanStart ||
        edit.spanEnd > input.length ||
        !Number.isInteger(edit.spanStart) ||
        !Number.isInteger(edit.spanEnd)
      ) {
        this.valid = false
        return
      }
      // Identity edits carry their original coordinates, not generated ones.
      if (input.slice(edit.spanStart, edit.spanEnd) === edit.replacement) continue
      carry(edit.spanStart)
      let replaced = 0
      for (const copy of [...(edit.copies ?? [])].sort((a, b) => a.emittedStart - b.emittedStart)) {
        if (
          ![copy.spanStart, copy.spanEnd, copy.emittedStart, copy.emittedEnd].every(
            Number.isInteger,
          ) ||
          copy.spanStart < edit.spanStart ||
          copy.spanEnd > edit.spanEnd ||
          copy.spanEnd <= copy.spanStart ||
          copy.emittedStart < replaced ||
          copy.emittedEnd > edit.replacement.length ||
          copy.emittedEnd <= copy.emittedStart ||
          input.slice(copy.spanStart, copy.spanEnd) !==
            edit.replacement.slice(copy.emittedStart, copy.emittedEnd)
        ) {
          this.valid = false
          return
        }
        if (copy.emittedStart > replaced)
          pieces.push({ start: length + replaced, end: length + copy.emittedStart })
        for (const piece of this.pieces) {
          const from = Math.max(piece.start, copy.spanStart)
          const to = Math.min(piece.end, copy.spanEnd)
          if (from >= to) continue
          pieces.push({
            start: length + copy.emittedStart + from - copy.spanStart,
            end: length + copy.emittedStart + to - copy.spanStart,
            ...(piece.authoredStart !== undefined
              ? {
                  authoredStart: piece.authoredStart + from - piece.start,
                  evidence: 'backend-copied-run' as const,
                }
              : {}),
          })
        }
        replaced = copy.emittedEnd
      }
      if (edit.replacement.length > replaced)
        pieces.push({ start: length + replaced, end: length + edit.replacement.length })
      next += edit.replacement
      length += edit.replacement.length
      cursor = edit.spanEnd
    }
    carry(input.length)
    this.input = next
    this.pieces = pieces
  }

  authored(input: string, start: number, end: number) {
    if (!this.valid || input !== this.input || start < 0 || end <= start || end > input.length)
      return undefined
    // A name crossing a generated gap or edit boundary is intentionally not
    // joined, even if two pieces happen to spell the same original text.
    const piece = this.pieces.find((piece) => piece.start <= start && piece.end >= end)
    if (piece?.authoredStart === undefined) return undefined
    const spanStart = piece.authoredStart + start - piece.start
    return { spanStart, spanEnd: spanStart + end - start }
  }

  matches(input: string): boolean {
    return this.valid && input === this.input
  }

  /** Reverse lookup for an authored reference carried through unchanged runs. */
  emitted(input: string, start: number, end: number) {
    const piece = this.emittedPiece(input, start, end)
    if (!piece) return undefined
    const spanStart = piece.start + start - piece.authoredStart!
    return { spanStart, spanEnd: spanStart + end - start }
  }

  evidence(input: string, start: number, end: number): SourceEvidence | undefined {
    const piece = this.emittedPiece(input, start, end)
    return piece ? (piece.evidence ?? 'unchanged-module-run') : undefined
  }

  /** Used to compose a real later edit over explicitly emitted copy ranges. */
  unchangedRuns(input: string) {
    if (!this.matches(input)) return undefined
    return this.pieces.flatMap((piece) =>
      piece.authoredStart === undefined
        ? []
        : [
            {
              spanStart: piece.authoredStart,
              spanEnd: piece.authoredStart + piece.end - piece.start,
              emittedStart: piece.start,
              emittedEnd: piece.end,
            },
          ],
    )
  }

  private emittedPiece(input: string, start: number, end: number) {
    if (!this.matches(input) || start < 0 || end <= start) return undefined
    const matches = this.pieces.filter(
      (piece) =>
        piece.authoredStart !== undefined &&
        piece.authoredStart <= start &&
        piece.authoredStart + piece.end - piece.start >= end,
    )
    if (matches.length !== 1) return undefined
    return matches[0]!
  }
}
