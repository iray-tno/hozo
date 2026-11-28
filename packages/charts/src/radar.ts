// Radar layout: one spoke per row, clockwise from twelve o'clock in data
// order, and one closed outline per series through its value on each
// spoke. It returns the same `ChartModel` as Line, with `line`, `area` and
// `point` marks, so the table, the summary, the sentence and the motion
// need nothing new; the grid and the spoke labels are in `radar`.

import {
  type ChartInput,
  type ChartModel,
  categoriesOf,
  defaultFormat,
  estimateTextWidth,
  extent,
  type Mark,
  rowValue,
  seriesLegend,
} from './model.ts'
import { linearScale, niceDomain } from './scale.ts'

export type RadarChartInput = Omit<ChartInput, 'margin' | 'references'>

export interface RadarLabel {
  datum: number
  x: number
  y: number
  text: string
  anchor: 'start' | 'middle' | 'end'
}

export interface Radar {
  cx: number
  cy: number
  radius: number
  /** A polygon through every spoke at each tick, with the tick's label beside the top spoke. */
  rings: { path: string; label: string; x: number; y: number }[]
  /** Each spoke's outer end. */
  spokes: { x: number; y: number }[]
  /** Each row's name, outside its spoke. */
  labels: RadarLabel[]
}

export type RadarModel = ChartModel & { radar: Radar }

const TAU = Math.PI * 2
const round = (value: number) => Math.round(value * 100) / 100

/** A point `r` out from the centre along spoke `i` of `n`, the first at twelve o'clock. */
function spoke(cx: number, cy: number, r: number, i: number, n: number): [number, number] {
  const angle = (i / n) * TAU
  return [round(cx + r * Math.sin(angle)), round(cy - r * Math.cos(angle))]
}

/**
 * A closed outline through `points` when every spoke has one. A gap breaks
 * it, as it breaks a line: the outline runs from just after one gap round
 * to just before the next, so it never shows a value nobody gave.
 */
export function radarPath(points: readonly ([number, number] | undefined)[]): string {
  const n = points.length
  if (points.every((point) => point !== undefined))
    return n === 0
      ? ''
      : `${points.map((point, i) => `${i ? 'L' : 'M'}${point?.[0]},${point?.[1]}`).join('')}Z`
  // Start after a gap, so a run that wraps past twelve o'clock stays whole.
  const start = points.indexOf(undefined) + 1
  let path = ''
  let run: [number, number][] = []
  const close = () => {
    if (run.length > 0)
      path += run.map((point, i) => `${i ? 'L' : 'M'}${point[0]},${point[1]}`).join('')
    run = []
  }
  for (let k = 0; k < n; k++) {
    const point = points[(start + k) % n]
    if (point) run.push(point)
    else close()
  }
  close()
  return path
}

export function radarChartModel(input: RadarChartInput): RadarModel {
  const fontSize = input.fontSize ?? 12
  const format = input.y?.format ?? defaultFormat
  const categories = categoriesOf(input)
  const values = input.series.map((series) => input.data.map((row) => rowValue(row, series.key)))
  const n = categories.length
  const gap = fontSize / 2
  const legend = seriesLegend(input)

  // Room for the names outside the circle: the widest beside it, a line above and below.
  const top = legend.height
  const nameWidth = Math.max(0, ...categories.map((name) => estimateTextWidth(name, fontSize)))
  const plotHeight = Math.max(0, input.height - top)
  const radius = Math.max(
    0,
    Math.min((input.width - (nameWidth + gap * 2) * 2) / 2, plotHeight / 2 - fontSize * 1.6),
  )
  const cx = input.width / 2
  const cy = top + plotHeight / 2

  // From zero, or from the lowest value when one is below it: a radar's
  // centre is its lowest value, and a spoke's length is read against it.
  const count = Math.max(2, Math.floor(radius / 30))
  const [lo, hi] = extent(values, true)
  const domain = input.y?.domain ?? niceDomain(lo, hi, count)
  const r = linearScale(domain, [0, radius])
  const ticks = r.ticks(count).filter((value) => r(value) > 0.5)

  const rings = ticks.map((value) => {
    const corners = Array.from({ length: n }, (_, i) => spoke(cx, cy, r(value), i, n))
    const path =
      n >= 3
        ? `${corners.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('')}Z`
        : // Fewer than three spokes make no polygon; a circle stands in.
          `M${round(cx)},${round(cy - r(value))}A${round(r(value))},${round(r(value))} 0 1 1 ${round(cx)},${round(cy + r(value))}A${round(r(value))},${round(r(value))} 0 1 1 ${round(cx)},${round(cy - r(value))}Z`
    return { path, label: format(value), x: round(cx + gap / 2), y: round(cy - r(value)) }
  })
  const spokes = Array.from({ length: n }, (_, i) => {
    const [x, y] = spoke(cx, cy, radius, i, n)
    return { x, y }
  })
  const labels: RadarLabel[] = categories.map((text, i) => {
    const angle = (i / n) * TAU
    const [x, y] = spoke(cx, cy, radius + gap, i, n)
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    return {
      datum: i,
      x,
      // Above the top spoke, below the bottom one, level with the rest.
      y: round(y + (cos > 0.5 ? -fontSize * 0.3 : cos < -0.5 ? fontSize * 0.9 : fontSize * 0.35)),
      text,
      anchor: sin > 0.1 ? 'start' : sin < -0.1 ? 'end' : 'middle',
    }
  })

  const marks: Mark[] = []
  const outlines = values.map((column) =>
    column.map((value, i) =>
      value === undefined ? undefined : spoke(cx, cy, Math.max(0, r(value)), i, n),
    ),
  )
  // Fills first, so every outline and dot is drawn over every fill.
  for (const [series, points] of outlines.entries())
    if (n >= 3 && points.every((point) => point !== undefined))
      marks.push({ kind: 'area', series, path: radarPath(points), opacity: 0.2 })
  for (const [series, points] of outlines.entries()) {
    marks.push({ kind: 'line', series, path: radarPath(points) })
    for (const [datum, point] of points.entries())
      if (point) marks.push({ kind: 'point', series, datum, cx: point[0], cy: point[1] })
  }

  return {
    width: input.width,
    height: input.height,
    plot: { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 },
    categories,
    values,
    marks,
    xTicks: [],
    yTicks: [],
    // The tooltip sits beside a spoke's outer end.
    centers: spokes.map((end) => end.x),
    // The spoke nearest the point's angle; the centre has none.
    datumAt(x: number, y = cy) {
      const dx = x - cx
      const dy = y - cy
      if (n === 0 || Math.hypot(dx, dy) < 1) return -1
      const theta = (Math.atan2(dx, -dy) + TAU) % TAU
      return Math.round(theta / (TAU / n)) % n
    },
    legend: legend.keys,
    radar: { cx, cy, radius, rings, spokes, labels },
    references: [],
  }
}
