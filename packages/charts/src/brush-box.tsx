// The Web half of the brush's box: a strip that fills its container's
// width, with the drawing hidden from a screen reader and the two ends of
// the range over it as sliders, each one tab stop moved by the arrow keys,
// Page Up and Down, Home and End. A press anywhere on the strip takes the
// nearer end, or the whole range when inside it, and drags it; pointer
// capture keeps the drag going past the strip's edge.

import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from 'react'
import { type BrushGrab, dragTo, grabAt, moveEnd } from './brush.ts'
import type { BrushBoxComponentProps } from './charts.tsx'

export type BrushBoxProps = BrushBoxComponentProps

/** Half the 24px target each end is given, centred on its grip. */
const HALF = 12

// The ring is a stylesheet rule because inline styles cannot say
// `:focus-visible`; React hoists it once into the head however many brushes
// there are.
const RING =
  '[data-hozo-brush-end]:focus-visible{outline:2px solid currentColor;outline-offset:-2px;border-radius:4px}'

export function BrushBox({
  width,
  height,
  label,
  count,
  range,
  valueText,
  model,
  children,
  onRange,
}: BrushBoxProps) {
  const ref = useRef<HTMLDivElement>(null)
  const grab = useRef<BrushGrab | undefined>(undefined)
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
  const drawn = resolved !== undefined && resolved > 0 ? model(resolved) : undefined
  const at = (event: PointerEvent<HTMLDivElement>) =>
    event.clientX - event.currentTarget.getBoundingClientRect().left

  const end = (which: 'start' | 'end') => {
    const index = range[which]
    const x = drawn ? (which === 'start' ? drawn.x0 : drawn.x1) : 0
    return (
      <div
        key={which}
        role="slider"
        data-hozo-brush-end=""
        tabIndex={0}
        aria-label={which === 'start' ? 'First shown' : 'Last shown'}
        aria-valuemin={which === 'start' ? 0 : range.start}
        aria-valuemax={which === 'start' ? range.end : count - 1}
        aria-valuenow={index}
        aria-valuetext={valueText(index)}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          const next = moveEnd(event.key, range, which, count)
          if (next === undefined) return
          event.preventDefault()
          onRange(next)
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: x - HALF,
          width: HALF * 2,
          height,
          cursor: 'ew-resize',
        }}
      />
    )
  }

  return (
    <div
      role="group"
      aria-label={`${label}, range shown`}
      style={{ position: 'relative', width: width ?? '100%', height, touchAction: 'pan-y' }}
      onPointerDown={(event) => {
        if (!drawn) return
        grab.current = grabAt(drawn, range, at(event), HALF)
        event.currentTarget.setPointerCapture?.(event.pointerId)
        onRange(dragTo(drawn, range, grab.current, at(event), count))
      }}
      onPointerMove={(event) => {
        if (drawn && grab.current) onRange(dragTo(drawn, range, grab.current, at(event), count))
      }}
      onPointerUp={() => {
        grab.current = undefined
      }}
      onLostPointerCapture={() => {
        grab.current = undefined
      }}
    >
      <style href="hozo-charts-brush" precedence="default">
        {RING}
      </style>
      <div ref={ref} aria-hidden="true" style={{ width: '100%', height }}>
        {resolved !== undefined && resolved > 0 ? children(resolved) : null}
      </div>
      {end('start')}
      {end('end')}
    </div>
  )
}
