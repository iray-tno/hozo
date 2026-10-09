/** An edit issued by the actual lowering stage; coordinates are its input's UTF-16 offsets. */
export interface SourceEdit {
  spanStart: number
  spanEnd: number
  replacement: string
}

interface Piece {
  start: number
  end: number
  authoredStart?: number
}

/**
 * Only unchanged runs retain authored coordinates. Generated replacement text
 * never acquires provenance just because it resembles an authored identifier.
 * This deliberately is not a fuzzy diff or a map of arbitrary generated JSX.
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
            ? { authoredStart: piece.authoredStart + from - piece.start }
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
      if (edit.replacement.length)
        pieces.push({ start: length, end: length + edit.replacement.length })
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
    if (!this.matches(input) || start < 0 || end <= start) return undefined
    const matches = this.pieces.filter(
      (piece) =>
        piece.authoredStart !== undefined &&
        piece.authoredStart <= start &&
        piece.authoredStart + piece.end - piece.start >= end,
    )
    if (matches.length !== 1) return undefined
    const piece = matches[0]!
    const spanStart = piece.start + start - piece.authoredStart!
    return { spanStart, spanEnd: spanStart + end - start }
  }
}
