// The Web half of the chart's box: a block that fills its container's
// width and reports it, so the model can lay the chart out at that width.
//
// It also decides what a screen reader meets (RFC 015 §5). The drawing is
// hidden from it, because its tick labels and shapes say less than the
// data. Around the drawing is one tab stop, named with the chart's label:
// arrow keys and the pointer move the active datum, and a polite live
// region says what it is. The table of the data stays in the tree, out of
// sight unless `showTable` asks for it, for reading the whole at once.

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ChartBoxComponentProps } from './charts.tsx'

export type ChartBoxProps = ChartBoxComponentProps

/** Out of sight, still read: the usual visually-hidden rules. */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export function ChartBox({
  width,
  height,
  children,
  table,
  summary,
  showTable = false,
  interaction,
}: ChartBoxProps) {
  const ref = useRef<HTMLDivElement>(null)
  const summaryId = useId()
  const [measured, setMeasured] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    if (width !== undefined) return
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry?.contentRect.width ?? 0)
      setMeasured((previous) => (previous === next ? previous : next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [width])
  const resolved = width ?? measured
  const pointer = (event: PointerEvent<HTMLDivElement>) => {
    if (resolved === undefined) return
    interaction.onPointer(
      event.clientX - event.currentTarget.getBoundingClientRect().left,
      resolved,
    )
  }
  return (
    <div style={{ position: 'relative', width: width ?? '100%' }}>
      <div
        role="group"
        aria-roledescription="chart"
        aria-label={interaction.label}
        aria-describedby={summaryId}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: one tab stop that the arrow keys move within
        tabIndex={0}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (interaction.onKey(event.key)) event.preventDefault()
        }}
        onPointerMove={pointer}
        onPointerDown={pointer}
        onPointerLeave={() => interaction.onLeave()}
        onBlur={() => interaction.onLeave()}
        style={{ width: '100%', touchAction: 'pan-y' }}
      >
        <div ref={ref} aria-hidden="true" style={{ width: '100%', height }}>
          {resolved !== undefined && resolved > 0 ? children(resolved) : null}
        </div>
      </div>
      <div aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN}>
        {interaction.announcement ?? ''}
      </div>
      <div style={showTable ? undefined : VISUALLY_HIDDEN}>
        {/* Read as the chart's description, so not a second time in the flow. */}
        <p id={summaryId} aria-hidden="true" style={{ margin: 0 }}>
          {summary}
        </p>
        {table}
      </div>
    </div>
  )
}
