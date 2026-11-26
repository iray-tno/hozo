// The Web half of the chart's box: a block that fills its container's
// width and reports it, so the model can lay the chart out at that width.

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

export interface ChartBoxProps {
  /** A fixed width; skips measurement, and is what server rendering draws. */
  width?: number
  height: number
  children: (width: number) => ReactNode
}

export function ChartBox({ width, height, children }: ChartBoxProps) {
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
    <div ref={ref} style={{ width: width ?? '100%', height }}>
      {resolved !== undefined && resolved > 0 ? children(resolved) : null}
    </div>
  )
}
