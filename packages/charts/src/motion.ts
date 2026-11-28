// Moving from one model to the next when the data changes, rather than
// jumping (RFC 015 §8). Drawn by interpolating the marks frame by frame in
// JavaScript, so Web and Native animate the same way: `react-native-svg`
// has no CSS transitions to lean on.
//
// Only the marks move. The axes, the key and the references take their new
// place at once, as does everything a screen reader meets: the table, the
// summary and the announcement describe the new data from the first frame.

import { useLayoutEffect, useRef, useState } from 'react'
import type { ChartModel, Mark } from './model.ts'

/** How long a change takes, in milliseconds. */
export const MOTION_DURATION = 300

/** Slow at both ends, so a mark eases out of one place and into the next. */
export function ease(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const round = (value: number) => Math.round(value * 100) / 100
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

/**
 * A path between two paths with the same commands, number by number. Paths
 * that differ in shape, as when a gap opens in a line, cannot be blended
 * that way, and the new one is drawn at once.
 */
export function lerpPath(from: string, to: string, t: number): string {
  const shape = (path: string) => path.replace(NUMBER, '#')
  if (shape(from) !== shape(to)) return to
  const a = from.match(NUMBER) ?? []
  let i = 0
  return to.replace(NUMBER, (b) => {
    const value = round(lerp(Number(a[i++]), Number(b), t))
    return String(value)
  })
}

function key(mark: Mark): string {
  return 'datum' in mark
    ? `${mark.kind}:${mark.series}:${mark.datum}`
    : `${mark.kind}:${mark.series}`
}

/** A bar that is new grows out of its baseline. */
function sprout(mark: Extract<Mark, { kind: 'bar' }>): Extract<Mark, { kind: 'bar' }> {
  switch (mark.end) {
    case 'bottom':
      return { ...mark, height: 0 }
    case 'right':
      return { ...mark, width: 0 }
    case 'left':
      return { ...mark, x: mark.x + mark.width, width: 0 }
    default:
      return { ...mark, y: mark.y + mark.height, height: 0 }
  }
}

function between(from: Mark | undefined, to: Mark, t: number): Mark {
  switch (to.kind) {
    case 'sweep':
      return from?.kind === 'sweep'
        ? {
            ...to,
            outer: lerp(from.outer, to.outer, t),
            inner: lerp(from.inner, to.inner, t),
            end: lerp(from.end, to.end, t),
          }
        : to
    case 'cell':
      return from?.kind === 'cell'
        ? {
            ...to,
            x: lerp(from.x, to.x, t),
            y: lerp(from.y, to.y, t),
            width: lerp(from.width, to.width, t),
            height: lerp(from.height, to.height, t),
          }
        : to
    case 'bar': {
      const start = from?.kind === 'bar' ? from : sprout(to)
      return {
        ...to,
        x: lerp(start.x, to.x, t),
        y: lerp(start.y, to.y, t),
        width: lerp(start.width, to.width, t),
        height: lerp(start.height, to.height, t),
      }
    }
    case 'point':
      return from?.kind === 'point'
        ? { ...to, cx: lerp(from.cx, to.cx, t), cy: lerp(from.cy, to.cy, t) }
        : to
    case 'line':
    case 'area':
    case 'stage':
      return from?.kind === to.kind ? { ...to, path: lerpPath(from.path, to.path, t) } : to
    // A slice's outline holds arc flags that do not blend; slices change at once.
    case 'arc':
      return to
  }
}

/** `to` with its marks `t` of the way from where they were in `from`. */
export function interpolateModel(from: ChartModel, to: ChartModel, t: number): ChartModel {
  if (t >= 1) return to
  const before = new Map(from.marks.map((mark) => [key(mark), mark]))
  return { ...to, marks: to.marks.map((mark) => between(before.get(key(mark)), mark, t)) }
}

/**
 * The model to draw: `target`, reached over `duration` from what was on
 * screen whenever `version` changes. A new width keeps the version, so a
 * resize redraws at once; so does `enabled: false`, for reduced motion.
 */
export function useAnimatedModel(
  target: ChartModel,
  version: unknown,
  enabled: boolean,
  duration = MOTION_DURATION,
): ChartModel {
  const [progress, setProgress] = useState<{ from: ChartModel; t: number } | null>(null)
  const seen = useRef(version)
  // Read when the version changes; toggling them alone must not cut a move short.
  const options = useRef({ enabled, duration })
  options.current = { enabled, duration }
  const shown = progress ? interpolateModel(progress.from, target, ease(progress.t)) : target
  const onScreen = useRef(shown)
  // Before `onScreen` moves on: a change mid-way starts from where the
  // marks are, not from where they were headed.
  useLayoutEffect(() => {
    if (seen.current === version) return
    seen.current = version
    const { enabled, duration } = options.current
    if (!enabled || duration <= 0) {
      setProgress(null)
      return
    }
    const from = onScreen.current
    const begin = Date.now()
    let frame = 0
    const step = () => {
      const t = Math.min(1, (Date.now() - begin) / duration)
      setProgress(t < 1 ? { from, t } : null)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    setProgress({ from, t: 0 })
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [version])
  useLayoutEffect(() => {
    onScreen.current = shown
  })
  return shown
}
