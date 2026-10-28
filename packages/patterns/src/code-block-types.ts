import type { CodeLine } from '@hozo/typography/code/model'

export interface CodeBlockOptions {
  lines: readonly CodeLine[] | string
  title?: string
  language?: string
  accessibilityLabel?: string
  lineNumbers?: boolean | { start: number }
  wrap?: boolean
  tabSize?: number
  theme?: string
  copy?: boolean | { text: string }
  /**
   * The tallest the lines may be, in pixels, before they scroll inside the
   * block instead of making it longer.
   *
   * A class such as `max-h-96` bounds the frame too, but only this lets the
   * block window its lines (see `windowing`): the windowing has to know it
   * is the scroller.
   */
  maxHeight?: number
  /**
   * Whether a block with `maxHeight` mounts only the lines near the visible
   * ones. Without `maxHeight` the block is not its own scroller and every
   * line is mounted whatever this says.
   *
   * Windowing is what makes a long block affordable (#1289), and it costs
   * something: find-in-page, select-all and a screen reader's own reading
   * reach only the mounted lines (the copy button still copies all of
   * them). `'auto'`, the default, windows only past 100 lines, where the
   * mount cost has been measured to matter; `'on'` and `'off'` decide regardless of length.
   */
  windowing?: 'auto' | 'on' | 'off'
}

/**
 * Past this many lines, `windowing: 'auto'` windows. On the Android
 * emulator a 100-line block took 77-164ms to mount whole and 38-57ms
 * windowed (#1377), and 10 lines showed no difference; #1289's full matrix
 * is what would move this.
 */
export const CODE_WINDOWING_AUTO_LINES = 100

/** Whether the lines are windowed: see `CodeBlockOptions.windowing`. */
export function codeBlockWindowed(props: CodeBlockOptions, lineCount: number): boolean {
  if (props.maxHeight === undefined) return false
  const windowing = props.windowing ?? 'auto'
  return windowing === 'on' || (windowing === 'auto' && lineCount > CODE_WINDOWING_AUTO_LINES)
}

export function codeLineStart(numbers: CodeBlockOptions['lineNumbers']): number {
  const start = typeof numbers === 'object' ? numbers.start : 1
  if (!Number.isSafeInteger(start)) throw new RangeError('lineNumbers.start must be a safe integer')
  return start
}

export function codeBlockLabels(props: CodeBlockOptions, fallback: string) {
  const first = (...values: (string | undefined)[]) =>
    values.find((value) => value?.trim()) ?? fallback
  return {
    title: first(props.title, props.language, props.accessibilityLabel),
    name: first(props.title, props.accessibilityLabel, props.language),
    captionNamesFigure: Boolean(props.title?.trim()),
  }
}
