// The Web half of the chart's box: a block that fills its container's
// width and reports it, so the model can lay the chart out at that width.
//
// It also decides what a screen reader meets (RFC 015 §5): the drawing is
// hidden from it, because its tick labels and shapes say less than the data,
// and the table of the data is kept in the accessibility tree but out of
// sight unless `showTable` asks for it.

import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react'

export interface ChartBoxProps {
  /** A fixed width; skips measurement, and is what server rendering draws. */
  width?: number
  height: number
  /** The drawing, at the measured width. */
  children: (width: number) => ReactNode
  /** The accessible equivalent. */
  table: ReactNode
  showTable?: boolean
}

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

export function ChartBox({ width, height, children, table, showTable = false }: ChartBoxProps) {
  const ref = useRef<HTMLDivElement>(null)
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
  return (
    <div style={{ position: 'relative', width: width ?? '100%' }}>
      <div ref={ref} aria-hidden="true" style={{ width: '100%', height }}>
        {resolved !== undefined && resolved > 0 ? children(resolved) : null}
      </div>
      <div style={showTable ? undefined : VISUALLY_HIDDEN}>{table}</div>
    </div>
  )
}
