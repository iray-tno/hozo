// Radial bar layout: one ring per row, the first outermost, and each
// series a bar bent along its ring, clockwise from twelve o'clock, as long
// in angle as its value. The full sweep is three quarters of a turn, so the
// longest bar never closes into a circle that hides where it ends, and the
// quarter left free holds the rows' names, level with their rings. It
// returns the same `ChartModel` as Bar, so the table, the summary and the
// sentence need nothing new; the rings and ticks are in `radialBar`.

import {
  BAR_MAX,
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
import { arcPath } from './pie.ts'
import { linearScale, niceDomain } from './scale.ts'

export type RadialBarChartInput = Omit<ChartInput, 'margin' | 'references'>

export interface RadialBar {
  cx: number
  cy: number
  /** The outer edge of the first ring and the inner edge of the last. */
  outer: number
  inner: number
  /** The angle of the largest value on the axis: three quarters of a turn. */
  sweep: number
  /** Each row's ring, outer and inner radius, for its track and its outline. */
  rings: { outer: number; inner: number }[]
  /** The value ticks: a spoke across the rings, labelled outside them. */
  ticks: {
    angle: number
    label: string
    x: number
    y: number
    anchor: 'start' | 'middle' | 'end'
  }[]
  /** Each row's name, ending at twelve o'clock, level with its ring. */
  labels: { datum: number; x: number; y: number; text: string }[]
}

export type RadialBarModel = ChartModel & { radialBar: RadialBar }

/** Three quarters of a turn, from twelve o'clock round to nine. */
export const SWEEP = Math.PI * 1.5
/** Between rings, and between the series' bars on one ring, unless the theme's bar gap says otherwise. */
const GAP = 2
const round = (value: number) => Math.round(value * 100) / 100

/** A point on a circle, with 0 at twelve o'clock and angles clockwise. */
function at(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [round(cx + r * Math.sin(angle)), round(cy - r * Math.cos(angle))]
}

/** A bar bent along a ring, from `start` to `end`, as an SVG path. */
export function sweepPath(mark: Extract<Mark, { kind: 'sweep' }>): string {
  return arcPath(mark.cx, mark.cy, mark.outer, mark.inner, mark.start, mark.end)
}

export function radialBarChartModel(input: RadialBarChartInput): RadialBarModel {
  const fontSize = input.fontSize ?? 12
  const format = input.y?.format ?? defaultFormat
  const categories = categoriesOf(input)
  const values = input.series.map((series) => input.data.map((row) => rowValue(row, series.key)))
  const n = categories.length
  const gap = fontSize / 2
  const legend = seriesLegend(input)

  // The tick labels go round the outside, so the circle leaves room for one
  // beside it and a line above and below.
  const [lo, hi] = extent(values, true)
  const roughCount = 5
  const domain = input.y?.domain ?? niceDomain(Math.min(0, lo), hi, roughCount)
  const probe = linearScale(domain, [0, 1])
  const tickValues = probe.ticks(roughCount).filter((value) => value >= domain[0])
  const tickLabels = tickValues.map(format)
  const widest = Math.max(0, ...tickLabels.map((label) => estimateTextWidth(label, fontSize)))
  const plotHeight = Math.max(0, input.height - legend.height)
  const outer = Math.max(
    0,
    Math.min(input.width / 2 - widest - gap * 2, plotHeight / 2 - fontSize * 2),
  )
  const cx = input.width / 2
  const cy = legend.height + plotHeight / 2
  // A hole in the middle, where the bars would be too short in arc to read.
  const inner = outer * 0.25
  const band = n > 0 ? (outer - inner) / n : 0
  const angle = linearScale([Math.max(0, domain[0]), domain[1]], [0, SWEEP])
  const toAngle = (value: number) => Math.max(0, Math.min(SWEEP, angle(value)))

  // Each ring as thick as its bars, each bar no thicker than the theme's
  // bar width, as straight bars are; a band wider than that is left as air,
  // centred, so a few rows read as bars and not as slabs of colour.
  const groups = Math.max(1, values.length)
  const want = input.bar?.gap ?? GAP
  const room = Math.max(0, band - (n > 1 ? Math.min(GAP, band / 4) : 0))
  const between = groups > 1 && room / groups > want * 3 ? want : 0
  const size = Math.max(
    0,
    Math.min(input.bar?.maxWidth ?? BAR_MAX, (room - between * (groups - 1)) / groups),
  )
  const thick = size * groups + between * (groups - 1)
  const rings = categories.map((_, i) => {
    const top = outer - i * band - (band - thick) / 2
    return { outer: round(top), inner: round(top - thick) }
  })
  const marks: Mark[] = []
  for (const [datum, ring] of rings.entries()) {
    for (const [series, column] of values.entries()) {
      const value = column[datum]
      // A value of zero or less has no bar; the table still reads it.
      if (value === undefined || value <= 0) continue
      const end = toAngle(value)
      if (end <= 0) continue
      const slotOuter = ring.outer - series * (size + between)
      marks.push({
        kind: 'sweep',
        series,
        datum,
        cx: round(cx),
        cy: round(cy),
        outer: round(slotOuter),
        inner: round(slotOuter - size),
        start: 0,
        end,
      })
    }
  }

  const ticks = tickValues.map((value, i) => {
    const a = toAngle(value)
    const [x, y] = at(cx, cy, outer + gap, a)
    const sin = Math.sin(a)
    const cos = Math.cos(a)
    return {
      angle: a,
      label: tickLabels[i] as string,
      x,
      y: round(y + (cos > 0.5 ? -fontSize * 0.2 : cos < -0.5 ? fontSize * 0.9 : fontSize * 0.35)),
      anchor: (sin > 0.1 ? 'start' : sin < -0.1 ? 'end' : 'middle') as 'start' | 'middle' | 'end',
    }
  })
  const labels = rings.map((ring, datum) => ({
    datum,
    x: round(cx - gap),
    y: round(cy - (ring.outer + ring.inner) / 2 + fontSize * 0.35),
    text: categories[datum] ?? '',
  }))

  // The rings run top to bottom at twelve o'clock, as horizontal bars'
  // rows do, so Down and Up step through them and the label is the centre.
  const centers = rings.map((ring) => round(cy - (ring.outer + ring.inner) / 2))
  return {
    width: input.width,
    height: input.height,
    plot: { x: cx - outer, y: cy - outer, width: outer * 2, height: outer * 2 },
    categories,
    values,
    marks,
    xTicks: [],
    yTicks: [],
    centers,
    horizontal: true,
    // The ring under the point; in the free quarter, the ring level with
    // it, so a row's name is a target too.
    datumAt(x: number, y = cy) {
      const r = x <= cx && y <= cy ? cy - y : Math.hypot(x - cx, y - cy)
      if (r > outer || r < inner || band <= 0) return -1
      return Math.min(n - 1, Math.floor((outer - r) / band))
    },
    legend: legend.keys,
    radialBar: { cx, cy, outer, inner, sweep: SWEEP, rings, ticks, labels },
    references: [],
  }
}
