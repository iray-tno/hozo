// A sparkline (RFC 015 §8): a word-sized line in a sentence or a table cell.
// It is not a chart a reader explores, so it is not a tab stop and has no
// table: it is one image whose name carries the label and what the line
// shows (where it starts and ends, and its extremes), because the shape is
// the whole point and a reader cannot see it.

import { Circle, Path, Svg } from '@hozo/svg'
import { linePath } from './model.ts'
import { NO_VALUE } from './no-value.ts'
import { linearScale } from './scale.ts'
import { type ColorScheme, useChartTheme } from './theme.tsx'

export interface SparklineInput {
  values: readonly (number | null | undefined)[]
  width: number
  height: number
  /** Room for the stroke and the end dot, so neither is clipped at the edge. */
  inset?: number
}

export interface SparklineModel {
  path: string
  /** The last value's point, marked with a dot; absent when it is a gap. */
  last?: { cx: number; cy: number }
}

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export function sparklineModel({
  values,
  width,
  height,
  inset = 2,
}: SparklineInput): SparklineModel {
  const present = values.filter(finite)
  if (present.length === 0) return { path: '' }
  const y = linearScale([Math.min(...present), Math.max(...present)], [height - inset, inset])
  const x = (i: number) =>
    values.length === 1 ? width / 2 : inset + (i / (values.length - 1)) * (width - inset * 2)
  const points = values.map((value, i) => (finite(value) ? ([x(i), y(value)] as const) : undefined))
  const end = points[points.length - 1]
  return { path: linePath(points), ...(end ? { last: { cx: end[0], cy: end[1] } } : {}) }
}

/**
 * What the line shows, in words: "30 values, from 412 to 380; lowest 71,
 * highest 730." A gap at either end reads as one; gaps are counted.
 */
export function sparklineSummary(
  values: readonly (number | null | undefined)[],
  format: (value: number) => string = String,
): string {
  const present = values.filter(finite)
  if (present.length === 0) return 'no values'
  const read = (value: number | null | undefined) => (finite(value) ? format(value) : NO_VALUE)
  const gaps = values.length - present.length
  const count = `${values.length.toLocaleString('en-US')} ${values.length === 1 ? 'value' : 'values'}`
  const span = `from ${read(values[0])} to ${read(values[values.length - 1])}`
  const extremes = `lowest ${format(Math.min(...present))}, highest ${format(Math.max(...present))}`
  const missing = gaps > 0 ? `, ${gaps.toLocaleString('en-US')} without a value` : ''
  return `${count}, ${span}; ${extremes}${missing}`
}

export interface SparklineProps {
  /** What the line is of: "Visits, last 30 days". The summary is added to it. */
  accessibilityLabel: string
  values: readonly (number | null | undefined)[]
  width?: number
  height?: number
  /** The line's colour; the theme palette's first by default. */
  color?: string
  format?: (value: number) => string
}

/**
 * Built per platform by `createCharts`, which passes what makes an SVG one
 * named image there: on Web the root's own `accessibilityLabel` does it,
 * on Native the view also needs to be `accessible` with the image role.
 */
export function createSparkline(
  image: Record<string, unknown>,
  useSystemScheme: () => ColorScheme = () => 'light',
) {
  return function Sparkline({
    accessibilityLabel,
    values,
    width = 96,
    height = 24,
    color,
    format,
  }: SparklineProps) {
    const theme = useChartTheme(undefined, useSystemScheme)
    const stroke = color ?? (theme.palette[0] as string)
    const model = sparklineModel({ values, width, height })
    return (
      <Svg
        {...image}
        accessibilityLabel={`${accessibilityLabel}: ${sparklineSummary(values, format)}.`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {model.path ? (
          <Path
            d={model.path}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {model.last ? <Circle cx={model.last.cx} cy={model.last.cy} r={2} fill={stroke} /> : null}
      </Svg>
    )
  }
}
