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
   * On React Native the block then mounts only the lines near the visible
   * ones, which is what makes a long block affordable there (#1289). The Web
   * keeps every line in the page, so that find-in-page and selection still
   * reach all of them; the cost #1289 measured is Native's. A class such as
   * `max-h-96` bounds the frame but cannot turn this on: the windowing has
   * to know it is the scroller.
   */
  maxHeight?: number
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
