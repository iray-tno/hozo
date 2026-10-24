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
