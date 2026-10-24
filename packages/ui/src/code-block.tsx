import { cx } from '@hozo/core'
import { type CodeBlockProps, CodeBlock as PatternCodeBlock } from '@hozo/patterns'

export type { CodeBlockProps } from '@hozo/patterns'

const frame =
  'flex w-full flex-col overflow-hidden rounded-hozo-surface border border-hozo-border bg-hozo-surface text-sm text-hozo-text-body'
const line = 'px-3 leading-6'
const gutter = 'select-none px-2 leading-6 text-hozo-text-muted'
const inserted = 'bg-hozo-code-insert-bg text-hozo-code-insert no-underline'
const removed = 'bg-hozo-code-delete-bg text-hozo-code-delete no-underline'
const highlighted = 'bg-hozo-code-highlight-bg text-hozo-code-highlight'
const caption = 'border-b border-hozo-border px-3 py-2 text-xs font-medium text-hozo-text-muted'
const copy =
  'self-end m-2 rounded-hozo-control bg-hozo-accent px-3 py-1 text-xs font-medium text-hozo-on-accent hover:bg-hozo-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'

export function CodeBlock({
  className,
  lineClassName,
  gutterClassName,
  insClassName,
  delClassName,
  markClassName,
  captionClassName,
  copyClassName,
  ...props
}: CodeBlockProps) {
  return (
    <PatternCodeBlock
      {...props}
      className={cx(frame, className)}
      lineClassName={cx(line, lineClassName)}
      gutterClassName={cx(gutter, gutterClassName)}
      insClassName={cx(inserted, insClassName)}
      delClassName={cx(removed, delClassName)}
      markClassName={cx(highlighted, markClassName)}
      captionClassName={cx(caption, captionClassName)}
      copyClassName={cx(copy, copyClassName)}
    />
  )
}
