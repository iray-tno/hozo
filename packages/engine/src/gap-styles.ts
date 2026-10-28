import { hozoAuthoredStyle } from './authored-gap.ts'
import { composeSpreadStyles } from './spread-styles.ts'

/** Only compiler-assessed possible gap owners import the gap-aware boundary. */
export function hozoGapSpreadStyles(
  styles: Readonly<Record<string, unknown>>,
  writtenLast: readonly string[],
  ...sources: readonly unknown[]
): Record<string, unknown> {
  return composeSpreadStyles(styles, writtenLast, sources, hozoAuthoredStyle)
}
