// Pie and donut layout (RFC 015 §8): one value per row, a slice for each
// positive value, in data order clockwise from twelve o'clock. It returns
// the same `ChartModel` as Bar and Line, with one series, so the table, the
// summary, the active datum and its sentence need nothing new. A slice is
// an `arc` mark; what only a pie has (its centre, radii, total and legend)
// is in `radial`.

import {
  type ChartModel,
  type ChartXAxis,
  estimateTextWidth,
  type Mark,
  rowValue,
} from './model.ts'

export interface PieValue {
  /** The field of each row that holds its value. */
  key: string
  /** What the value is, read with each slice: "Revenue: $120 (40%)". */
  label: string
  format?: (value: number) => string
}

export interface PieChartInput {
  data: readonly Record<string, unknown>[]
  x: ChartXAxis
  value: PieValue
  width: number
  height: number
  /** The hole as a fraction of the radius: 0 is a pie, 0.6 a donut. */
  innerRadius?: number
  fontSize?: number
}

export interface LegendEntry {
  datum: number
  /** The slice's palette index. */
  tone: number
  label: string
  x: number
  y: number
}

export interface Radial {
  cx: number
  cy: number
  outer: number
  inner: number
  /** The sum of the positive values: the whole that each slice is a share of. */
  total: number
  legend: LegendEntry[]
  swatch: number
}

export type PieModel = ChartModel & { radial: Radial }

const TAU = Math.PI * 2
const round = (value: number) => Math.round(value * 100) / 100

/** A point on a circle, with 0 at twelve o'clock and angles clockwise. */
function at(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [round(cx + r * Math.sin(angle)), round(cy - r * Math.cos(angle))]
}

/**
 * One slice from `a0` to `a1`, as a path. A whole circle is two half arcs,
 * since an SVG arc whose ends meet draws nothing. With an inner radius the
 * slice is a ring segment: out along the outer arc, back along the inner.
 */
export function arcPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  a0: number,
  a1: number,
): string {
  if (a1 - a0 >= TAU - 1e-9) {
    const half = a0 + Math.PI
    const ring = (r: number, sweep: 0 | 1) => {
      const [x0, y0] = at(cx, cy, r, a0)
      const [x1, y1] = at(cx, cy, r, half)
      return `M${x0},${y0}A${r},${r} 0 1 ${sweep} ${x1},${y1}A${r},${r} 0 1 ${sweep} ${x0},${y0}Z`
    }
    return inner > 0 ? ring(outer, 1) + ring(inner, 0) : ring(outer, 1)
  }
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [ox0, oy0] = at(cx, cy, outer, a0)
  const [ox1, oy1] = at(cx, cy, outer, a1)
  const outerArc = `M${ox0},${oy0}A${outer},${outer} 0 ${large} 1 ${ox1},${oy1}`
  if (inner <= 0) return `${outerArc}L${round(cx)},${round(cy)}Z`
  const [ix0, iy0] = at(cx, cy, inner, a0)
  const [ix1, iy1] = at(cx, cy, inner, a1)
  return `${outerArc}L${ix1},${iy1}A${inner},${inner} 0 ${large} 0 ${ix0},${iy0}Z`
}

/** Each value as a share of the positive total: "$120 (40%)". */
export function shareFormat(
  data: readonly Record<string, unknown>[],
  key: string,
  format: (value: number) => string = String,
): (value: number) => string {
  let total = 0
  for (const row of data) {
    const value = rowValue(row, key)
    if (value !== undefined && value > 0) total += value
  }
  return (value) => {
    if (total <= 0 || value <= 0) return format(value)
    return `${format(value)} (${Number(((value / total) * 100).toFixed(1))}%)`
  }
}

/**
 * The palette index of each of `count` slices, in order. The palette is
 * six long, so a seventh slice would take the first's colour and sit right
 * beside it, the circle closing there; a last slice that would match the
 * first takes the next colour instead, which matches neither neighbour.
 */
export function paletteTones(count: number, size = 6): number[] {
  const tones = Array.from({ length: count }, (_, i) => i % size)
  if (count > 2 && tones[count - 1] === 0) tones[count - 1] = 1
  return tones
}

export function pieChartModel(input: PieChartInput): PieModel {
  const fontSize = input.fontSize ?? 12
  const format = input.x.format ?? ((value: unknown) => String(value ?? ''))
  const categories = input.data.map((row) => format(row[input.x.key]))
  // Zero, negative and missing values have no slice; the table still lists
  // them, and a gap reads as one.
  const column = input.data.map((row) => rowValue(row, input.value.key))
  const total = column.reduce<number>((sum, value) => sum + (value && value > 0 ? value : 0), 0)

  // Only rows with a slice have a colour to explain; the table lists the rest.
  const sliced = column.flatMap((value, datum) =>
    value !== undefined && value > 0 && total > 0 ? [datum] : [],
  )
  // The legend goes to the right when there is room for it beside the
  // circle, and underneath otherwise, shrinking the circle to fit.
  const gap = fontSize
  const swatch = fontSize * 0.75
  const lineHeight = fontSize * 1.6
  const legendWidth =
    swatch +
    fontSize / 2 +
    Math.max(0, ...sliced.map((datum) => estimateTextWidth(categories[datum] ?? '', fontSize)))
  const legendHeight = sliced.length * lineHeight
  const beside = input.width - input.height >= legendWidth + gap
  const diameter = Math.max(
    0,
    beside
      ? Math.min(input.height, input.width - legendWidth - gap) - gap
      : Math.min(input.width, input.height - legendHeight - gap) - gap,
  )
  const outer = diameter / 2
  const inner = outer * Math.min(0.9, Math.max(0, input.innerRadius ?? 0))
  const cx = beside ? gap / 2 + outer : input.width / 2
  const cy = beside ? input.height / 2 : gap / 2 + outer
  const legendX = beside ? cx + outer + gap : Math.max(0, (input.width - legendWidth) / 2)
  const legendY = beside ? Math.max(0, cy - legendHeight / 2) : cy + outer + gap
  const tones = paletteTones(sliced.length)
  const legend = sliced.map((datum, row) => ({
    datum,
    tone: tones[row] as number,
    label: categories[datum] ?? '',
    x: legendX,
    y: legendY + row * lineHeight,
  }))

  const marks: Mark[] = []
  const angles: [number, number][] = []
  let angle = 0
  for (const [datum, value] of column.entries()) {
    if (value === undefined || value <= 0 || total <= 0) {
      angles.push([angle, angle])
      continue
    }
    const a1 = angle + (value / total) * TAU
    angles.push([angle, a1])
    const mid = (angle + a1) / 2
    const [mx, my] = at(cx, cy, (outer + inner) / 2, mid)
    marks.push({
      kind: 'arc',
      series: 0,
      datum,
      tone: tones[marks.length] as number,
      path: arcPath(cx, cy, outer, inner, angle, a1),
      cx: mx,
      cy: my,
    })
    angle = a1
  }
  // The tooltip sits beside a slice's middle, as it sits beside a bar.
  const centers = angles.map(([a0, a1]) => at(cx, cy, (outer + inner) / 2, (a0 + a1) / 2)[0])

  return {
    width: input.width,
    height: input.height,
    plot: { x: cx - outer, y: cy - outer, width: diameter, height: diameter },
    categories,
    values: [column],
    marks,
    xTicks: [],
    yTicks: [],
    centers,
    // The slice under the point, by its angle, if the point is on the
    // ring; a legend row by its line, so the legend is a target too.
    datumAt(x: number, y = cy) {
      const dx = x - cx
      const dy = y - cy
      const r = Math.hypot(dx, dy)
      if (r <= outer && r >= inner) {
        const theta = (Math.atan2(dx, -dy) + TAU) % TAU
        return angles.findIndex(([a0, a1]) => a1 > a0 && theta >= a0 && theta < a1)
      }
      const row = Math.floor((y - legendY) / lineHeight)
      if (x >= legendX && x <= legendX + legendWidth && row >= 0 && row < legend.length)
        return legend[row]?.datum ?? -1
      return -1
    },
    radial: { cx, cy, outer, inner, total, legend, swatch },
  }
}
