import { cx } from '@hozo/core'
import {
  ResizablePane as PatternPane,
  Splitter as PatternSplitter,
  type ResizablePaneProps,
  type SplitterProps,
} from '@hozo/patterns'

export type { ResizablePaneProps, SplitterProps } from '@hozo/patterns'

type Side = NonNullable<SplitterProps['side']>

// The handle is the 1px line between the pane and the surface beside it, and
// nothing else is painted. It used to be an 8px box with the line on one
// edge, and its focus ring, hover tint and drag tint all filled that box: they
// sat beside the line, on the surface's side, rather than around it. Now the
// ring is an outline around the line, the same width either side of it, and
// hover and drag recolour the line. What a pointer grabs is the pattern's
// reach (Web) or `hitSlop` (Native), which extends the same distance both
// ways. Before that the 8px was filled in a text colour, a band that read as
// a heavy bar rather than a division (#1448).
const handle =
  'self-stretch shrink-0 bg-hozo-border-strong hover:bg-hozo-accent-hover focus-visible:rounded-full focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-hozo-focus data-[dragging]:bg-hozo-accent data-[collapsed]:bg-hozo-text-subtle'

const line: Record<Side, string> = {
  start: 'w-px cursor-col-resize',
  end: 'w-px cursor-col-resize',
  top: 'h-px cursor-row-resize',
  bottom: 'h-px cursor-row-resize',
}

// A pane is placed against an edge of the surface it divides, and a filled
// pane's square corners stood out past that surface's rounded ones. The two
// outer corners on its edge take the surface radius; the inner ones, against
// the handle, stay square. A pane somewhere else can say otherwise through
// `paneClassName`.
const pane: Record<Side, string> = {
  start: 'rounded-s-hozo-surface',
  end: 'rounded-e-hozo-surface',
  top: 'rounded-t-hozo-surface',
  bottom: 'rounded-b-hozo-surface',
}

export function Splitter({ className, ...props }: SplitterProps) {
  const side = props.side ?? (props.orientation === 'horizontal' ? 'top' : 'start')
  return <PatternSplitter {...props} className={cx(handle, line[side], className)} />
}

export function ResizablePane({ handleClassName, paneClassName, ...props }: ResizablePaneProps) {
  return (
    <PatternPane
      {...props}
      paneClassName={cx(pane[props.side], paneClassName)}
      handleClassName={cx(handle, line[props.side], handleClassName)}
    />
  )
}
