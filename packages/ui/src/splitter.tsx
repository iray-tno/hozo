import { cx } from '@hozo/core'
import {
  ResizablePane as PatternPane,
  Splitter as PatternSplitter,
  type ResizablePaneProps,
  type SplitterProps,
} from '@hozo/patterns'

export type { ResizablePaneProps, SplitterProps } from '@hozo/patterns'

const vertical =
  'w-2 self-stretch shrink-0 cursor-col-resize bg-hozo-text-muted hover:bg-hozo-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus data-[dragging]:bg-hozo-accent data-[collapsed]:bg-hozo-text-subtle'
const horizontal =
  'h-2 self-stretch shrink-0 cursor-row-resize bg-hozo-text-muted hover:bg-hozo-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus data-[dragging]:bg-hozo-accent data-[collapsed]:bg-hozo-text-subtle'

export function Splitter({ className, ...props }: SplitterProps) {
  const side = props.side ?? (props.orientation === 'horizontal' ? 'top' : 'start')
  return (
    <PatternSplitter
      {...props}
      className={cx(side === 'top' || side === 'bottom' ? horizontal : vertical, className)}
    />
  )
}

export function ResizablePane({ handleClassName, ...props }: ResizablePaneProps) {
  return (
    <PatternPane
      {...props}
      handleClassName={cx(
        props.side === 'top' || props.side === 'bottom' ? horizontal : vertical,
        handleClassName,
      )}
    />
  )
}
