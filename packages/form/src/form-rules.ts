/**
 * The one decision a form makes, with no element in it.
 *
 * Shaped after `initialFocusIndex` in `@hozo/behaviors`' focus scope, which is
 * the house precedent for this: the component does the DOM query and hands over
 * a list of plain descriptions, so the rule itself can be tested without a
 * document. There is no DOM in this package's test suite -- the files called
 * `*-dom.test.ts` render to a string -- and a rule that could only be exercised
 * through a browser is a rule nobody checks.
 */

export interface FormControlState {
  /** Whether the control is marked invalid. */
  invalid?: boolean
  /**
   * Whether focus can actually land on it.
   *
   * A control can be marked invalid and be unreachable -- removed from the
   * document between the press and the handler, or disabled by the same render
   * that flagged it. Moving focus to it would put focus on `<body>` instead,
   * which is worse than leaving it where it was: the person loses their place and
   * is told nothing.
   */
  focusable?: boolean
}

/**
 * The first control worth sending someone back to, or `null` for none.
 *
 * Document order, because that is the order the page was filled in and the order
 * the errors were read out. "First" meaning first in the list given, so the
 * caller decides what order means.
 *
 * `null` both when nothing is invalid and when nothing invalid can be focused,
 * which collapses two cases a caller would treat the same way: submit, or do not
 * move focus. The difference between them is whether `onSubmit` runs, and that is
 * `shouldSubmit`'s question rather than this one.
 */
export function firstInvalid(controls: readonly FormControlState[]): number | null {
  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index] as FormControlState
    if (control.invalid && control.focusable !== false) return index
  }
  return null
}

/**
 * Whether a submission should go ahead.
 *
 * False when anything is marked invalid, whether or not it can be focused. A
 * form that submitted because the field it was going to complain about had
 * become unreachable would be the worst of the three outcomes -- the data goes,
 * and nobody was told.
 *
 * This reads `aria-invalid` and nothing else. Hozo owns no validation and no
 * message catalogue ([#157](https://github.com/iray-tno/hozo/issues/157)), so
 * what counts as invalid is the application's answer, already written down in the
 * attribute a screen reader is reading. The form only declines to ignore it.
 */
export function shouldSubmit(controls: readonly FormControlState[]): boolean {
  return !controls.some((control) => control.invalid)
}
