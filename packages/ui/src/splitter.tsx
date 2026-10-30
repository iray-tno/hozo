import { cx } from '@hozo/core'
import {
  ResizablePane as PatternPane,
  Splitter as PatternSplitter,
  type ResizablePaneProps,
  type SplitterProps,
} from '@hozo/patterns'

export type { ResizablePaneProps, SplitterProps } from '@hozo/patterns'

type Side = NonNullable<SplitterProps['side']>

// The handle is two things that used to be one. What a pointer grabs stays
// 8px across, so resizing is no harder to start than it was; what is painted
// is a 1px line on the edge it shares with the pane. The whole 8px used to be
// filled in a text colour, a band that read as a heavy bar rather than a
// division (#1448). The band shows only while it is in use: a hover tint, the
// accent while dragging.
const handle =
  'self-stretch shrink-0 bg-transparent border-hozo-border-strong hover:bg-hozo-surface-hover hover:border-hozo-accent-hover focus-visible:rounded-hozo-control focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-hozo-focus data-[dragging]:bg-hozo-accent-subtle data-[dragging]:border-hozo-accent data-[collapsed]:border-hozo-text-subtle'

// The line sits on the pane's side of the handle. `side` names where the pane
// is, and the handle is on the pane's far edge from it.
const line: Record<Side, string> = {
  start: 'w-2 cursor-col-resize border-s',
  end: 'w-2 cursor-col-resize border-e',
  top: 'h-2 cursor-row-resize border-t',
  bottom: 'h-2 cursor-row-resize border-b',
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
