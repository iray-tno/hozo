/**
 * The arithmetic an auto-growing field is, with no element in it.
 *
 * Split out for the reason `slider-rules.ts` and `sheet-rules.ts` are: what is
 * hard about a textarea that grows is not the markup. How tall three rows are,
 * when a cap turns growth into scrolling, and when a character count is worth
 * saying out loud are all answerable from numbers, and both platform halves
 * import these so the Web field and the Native field cannot disagree about how
 * tall four rows is.
 *
 * ## One line is `lineHeight`, and the rest is `extra`
 *
 * Every height here is `rows * lineHeight + extra`, where `extra` is everything
 * in the box that is not text -- padding and borders along the block axis. The
 * split exists because the two platforms measure different things: a Web
 * `scrollHeight` already includes padding, and React Native's
 * `onContentSizeChange` reports the content alone. Each half hands over its own
 * numbers and this module does not have to know which is which.
 */

/** What to assume when nothing reports a line height. Tailwind's `text-sm`. */
export const FALLBACK_LINE_HEIGHT = 20

/**
 * A usable line height from a declared one and a font size.
 *
 * `getComputedStyle().lineHeight` is the string `"normal"` whenever nothing set
 * it, and React Native leaves `lineHeight` undefined for the same reason. 1.2
 * is the factor browsers use for `normal` on most fonts -- near enough for
 * deciding how tall three rows are, and the alternative is measuring a hidden
 * element on every keystroke.
 */
export function usableLineHeight(declared: number | undefined, fontSize?: number): number {
  if (declared !== undefined && Number.isFinite(declared) && declared > 0) return declared
  if (fontSize !== undefined && Number.isFinite(fontSize) && fontSize > 0) {
    return Math.round(fontSize * 1.2)
  }
  return FALLBACK_LINE_HEIGHT
}

export interface TextAreaBox {
  /** The height the platform measured for the text, in px. */
  content: number
  lineHeight: number
  /** Padding and borders along the block axis -- everything that is not text. */
  extra?: number
  /** Never shorter than this many rows. One by default: a field is not nothing. */
  minRows?: number
  /** Never taller than this many rows. Unbounded when left out. */
  maxRows?: number
}

/** The height a box of exactly `rows` lines wants. */
export function heightForRows(rows: number, lineHeight: number, extra = 0): number {
  return Math.max(0, rows) * lineHeight + extra
}

export interface TextAreaSize {
  /** What the field should be, in px. */
  height: number
  /**
   * Whether the text is taller than the cap, so the field has to scroll.
   *
   * The reason this is an output rather than a style the caller always sets:
   * `overflow: auto` on a field that is still growing shows a scrollbar for the
   * instant between the text wrapping and the height catching up, on every
   * keystroke. Hidden while it grows and scrollable once it cannot is the
   * behaviour nobody notices, which is the goal.
   */
  scrollable: boolean
}

/**
 * How tall the field should be, and whether it has stopped growing.
 *
 * A measurement smaller than `minRows` is rounded up rather than trusted: an
 * empty field measures one line on both platforms, and a caller asking for three
 * is asking for three before anything is typed.
 */
export function clampedSize(box: TextAreaBox): TextAreaSize {
  const { content, extra = 0 } = box
  const lineHeight = usableLineHeight(box.lineHeight)
  const minRows = Math.max(1, Math.floor(box.minRows ?? 1))
  const floor = heightForRows(minRows, lineHeight, extra)
  const wanted = Math.max(floor, content + extra)

  if (box.maxRows === undefined) return { height: wanted, scrollable: false }

  // A cap below the floor is a caller contradicting themselves. The floor wins,
  // because a field shorter than its own minimum is the one of the two that
  // cannot be rendered at all.
  const maxRows = Math.max(minRows, Math.floor(box.maxRows))
  const ceiling = heightForRows(maxRows, lineHeight, extra)
  // A single pixel over the cap is rounding, not a tenth of a line. Growth stops
  // when there is a visible line's worth of text past it.
  return { height: Math.min(wanted, ceiling), scrollable: wanted > ceiling + 1 }
}

/** How many characters are left, or `null` when nothing is counting. */
export function remainingCharacters(value: string, maxLength?: number): number | null {
  if (maxLength === undefined || !Number.isFinite(maxLength)) return null
  return Math.max(0, Math.floor(maxLength) - [...value].length)
}

export interface CountAnnouncement {
  previous: number | null
  remaining: number | null
  /** How few characters left is worth saying. Ten by default. */
  threshold?: number
}

/**
 * Whether a character count is worth announcing, which is mostly "no".
 *
 * #143 asks for the count to be read with `aria-live`, and the naive reading of
 * that -- a live region holding the number -- interrupts a screen reader on
 * every keystroke and makes the field unusable. So the count is always rendered
 * and referenced with `aria-describedby`, where it is read on focus and
 * available on demand, and this decides the much smaller question of when to
 * speak unprompted.
 *
 * Twice, at most: once when the remaining count first drops into the last
 * `threshold` characters, and once when it reaches zero. Going back up, by
 * deleting, re-arms both -- somebody who has deleted their way out of the limit
 * and typed back into it is in the situation the warning is for again.
 */
export function shouldAnnounceCount(announcement: CountAnnouncement): boolean {
  const { previous, remaining, threshold = 10 } = announcement
  if (remaining === null) return false
  // Nothing to compare against on the first render, and a field that announced
  // its own mount would speak over whatever opened it.
  if (previous === null) return false
  if (remaining === 0) return previous > 0
  return remaining <= threshold && previous > threshold
}
