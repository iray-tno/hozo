// The public charts (RFC 015 §3): a model from the data, laid out at the
// box's width, drawn by the SVG renderer, with the table of the same data
// for a screen reader.
//
// The box is the one platform-specific piece (a measured `<div>` on Web, a
// `View` with `onLayout` on Native), so each entry point passes its own in
// rather than this module importing one: an explicit `.tsx` import would
// pick the Web half on Native too.

import { type ComponentType, type ReactNode, useId, useMemo } from 'react'
import { datumSentence, nextDatum } from './active.ts'
import { ChartSvg, type ChartSvgProps } from './chart-svg.tsx'
import { ChartTable } from './chart-table.tsx'
import { type FunnelValue, funnelChartModel, funnelSeries } from './funnel.ts'
import {
  type AreaChartInput,
  areaChartModel,
  type BarChartInput,
  barChartModel,
  type ChartInput,
  type ChartModel,
  type ComposedSeries,
  type Curve,
  composedChartModel,
  lineChartModel,
} from './model.ts'
import { useAnimatedModel } from './motion.ts'
import { seriesColor } from './palette.ts'
import { type PieValue, pieChartModel, shareFormat } from './pie.ts'
import { type ScatterName, type ScatterXAxis, scatterChartModel } from './scatter.ts'
import { chartSummary, includesTable } from './summary.ts'
import { useActiveDatum } from './sync.tsx'
import {
  type ChartTheme,
  type ColorScheme,
  type ResolvedChartTheme,
  useChartTheme,
} from './theme.tsx'

type Common = Omit<ChartInput, 'width'> & {
  /**
   * Names the chart for a screen reader, which reads it as the name of the
   * table of its data. Required: an unnamed chart is a picture of nothing.
   */
  accessibilityLabel: string
  /** A fixed width; otherwise the chart fills its container. */
  width?: number
  /** Axis text and lines; inherits the surrounding text colour on Web when absent. */
  textColor?: string
  /** Palette, bar shape, line weight and frame, over any `ChartThemeProvider` above. */
  theme?: ChartTheme
  /** Show the table of the data under the chart, not only to a screen reader. */
  showTable?: boolean
  /**
   * Move the marks to new data rather than jump; true by default. Never
   * when the reader asks for reduced motion, whatever this says.
   */
  animate?: boolean
}

export type BarChartProps = Common & Pick<BarChartInput, 'stacked' | 'horizontal'>

export type LineChartProps = Common & {
  /** Draw a dot at each value. */
  points?: boolean
  /** Straight between values (the default), or a monotone curve through them. */
  curve?: Curve
}

export type AreaChartProps = LineChartProps & Pick<AreaChartInput, 'stacked'>

export type ScatterChartProps = Omit<Common, 'x'> & {
  /** The numeric field along x; the rows are read in its order. */
  x: ScatterXAxis
  /** The field that names each point; otherwise a point is named by its x value. */
  name?: ScatterName
}

export type ComposedChartProps = Omit<Common, 'series'> & {
  /** Each series as bars (the default) or, with `type: 'line'`, a line. */
  series: readonly ComposedSeries[]
  /** Draw a dot at each value of the line series. */
  points?: boolean
  /** How the line series run between values. */
  curve?: Curve
}

export type PieChartProps = Omit<Common, 'series' | 'y' | 'margin' | 'references' | 'legend'> & {
  /** The field each slice's size comes from, and what to call it when read. */
  value: PieValue
  /** Slice colours by row; the default palette fills the rest. */
  colors?: readonly string[]
  /** The hole as a fraction of the radius; 0 by default, `DonutChart` 0.6. */
  innerRadius?: number
}

export type FunnelChartProps = Omit<Common, 'series' | 'y' | 'margin' | 'references' | 'legend'> & {
  /** The field each stage's count comes from, and what to call it when read. */
  value: FunnelValue
}

/** What the box wires to the platform's focus, keys, pointer and touch. */
export interface ChartInteraction {
  /** The chart's name, on its one focusable element. */
  label: string
  /** The active datum's sentence, or undefined with none active. */
  announcement?: string
  /** A pointer or finger at (`x`, `y`) in a drawing `width` wide. */
  onPointer(x: number, y: number, width: number): void
  onLeave(): void
  /** A key (or a Native adjust action as one); true when it was used. */
  onKey(key: string): boolean
}

export interface ChartBoxComponentProps {
  width?: number
  height: number
  children: (width: number) => ReactNode
  /** The table of the data, or `null` when there are too many rows to list. */
  table: ReactNode
  /** The chart in one paragraph: its range and each series' extremes. */
  summary: string
  showTable?: boolean
  interaction: ChartInteraction
}

/** `model`, remembering its last answer: the box asks at one width until it resizes. */
function lastWidth(model: (width: number) => ChartModel): (width: number) => ChartModel {
  let width: number | undefined
  let last: ChartModel | undefined
  return (next) => {
    if (last === undefined || width !== next) {
      width = next
      last = model(next)
    }
    return last
  }
}

/** Light when the platform gives no way to ask, as in a test. */
const noScheme = (): ColorScheme => 'light'
/** Still when the platform gives no way to ask. */
const noMotion = () => true

/**
 * The drawing, moving to a new model when `version` changes. It is the
 * data, so a resize or a new theme redraws at once and only new data moves.
 */
function MovingSvg({
  version,
  enabled,
  model,
  ...props
}: ChartSvgProps & { version: unknown; enabled: boolean }) {
  return <ChartSvg {...props} model={useAnimatedModel(model, version, enabled)} />
}

export function createCharts(
  ChartBox: ComponentType<ChartBoxComponentProps>,
  useSystemScheme: () => ColorScheme = noScheme,
  useReducedMotion: () => boolean = noMotion,
) {
  function Chart({
    props,
    model,
    points,
    colors,
  }: {
    props: Common
    model: (width: number, theme: ResolvedChartTheme) => ChartModel
    points?: boolean
    colors?: readonly string[]
  }) {
    const { accessibilityLabel, width, textColor, showTable, height, fontSize, x, y } = props
    // The table does not depend on the width, so it is built once from a
    // model at any width rather than waiting for the box to be measured: a
    // screen reader and server rendering both get it on the first pass.
    // Moving the active datum re-renders this component and nothing above
    // it, so `model` keeps its identity across those steps and the layout,
    // the table and the marks are reused rather than rebuilt per key press.
    const theme = useChartTheme(props.theme, useSystemScheme)
    const reduced = useReducedMotion()
    const moves = (props.animate ?? true) && !reduced
    // Each series with its colour from the theme's palette, so the table,
    // the tooltip and the marks agree on it.
    const series = useMemo(
      () =>
        props.series.map((entry, index) => ({
          ...entry,
          color: seriesColor(index, entry.color, theme.palette),
        })),
      [props.series, theme.palette],
    )
    const drawn = useMemo(() => lastWidth((next) => model(next, theme)), [model, theme])
    const data = useMemo(
      () => (width === undefined ? model(1, theme) : drawn(width)),
      [model, drawn, width, theme],
    )
    const count = data.categories.length
    // Shared with the other charts in a `ChartSync`, where only the chart the
    // reader moved in announces.
    const id = useId()
    const [active, setActive, speaks] = useActiveDatum(data.categories, id)
    const interaction = {
      label: accessibilityLabel,
      announcement:
        active === undefined || !speaks
          ? undefined
          : datumSentence(data, series, active, y?.format),
      // A position is answered by the model at the drawn width; everything
      // else by the width-independent one the table uses.
      onPointer: (px: number, py: number, drawnWidth: number) => {
        const datum = drawn(drawnWidth).datumAt(px, py)
        if (datum >= 0) setActive(datum)
      },
      onLeave: () => setActive(undefined),
      onKey: (key: string) => {
        const next = nextDatum(key, active, count, data.horizontal)
        if (next === undefined) return false
        setActive(next)
        return true
      },
    }
    const withTable = includesTable(count, showTable ?? false)
    const summary = useMemo(
      () => chartSummary(data, series, y?.format, !withTable),
      [data, series, y?.format, withTable],
    )
    const table = useMemo(
      () =>
        withTable ? (
          <ChartTable
            model={data}
            series={series}
            accessibilityLabel={accessibilityLabel}
            categoryLabel={x.label}
            format={y?.format}
          />
        ) : null,
      [withTable, data, series, accessibilityLabel, x.label, y?.format],
    )
    return (
      <ChartBox
        width={width}
        height={height}
        table={table}
        summary={summary}
        showTable={showTable}
        interaction={interaction}
      >
        {(drawnWidth) => (
          <MovingSvg
            version={props.data}
            enabled={moves}
            model={drawn(drawnWidth)}
            active={active}
            format={y?.format}
            series={series}
            points={points}
            fontSize={fontSize}
            textColor={textColor}
            colors={colors}
            look={theme}
          />
        )}
      </ChartBox>
    )
  }

  function BarChart({ stacked, horizontal, ...props }: BarChartProps) {
    return (
      <Chart
        props={props}
        model={(width, theme) =>
          barChartModel({ ...props, stacked, horizontal, width, bar: theme.bar })
        }
      />
    )
  }

  function LineChart({ points, ...props }: LineChartProps) {
    return (
      <Chart props={props} points={points} model={(width) => lineChartModel({ ...props, width })} />
    )
  }

  function AreaChart({ points, stacked, ...props }: AreaChartProps) {
    return (
      <Chart
        props={props}
        points={points}
        model={(width) => areaChartModel({ ...props, stacked, width })}
      />
    )
  }

  function ComposedChart({ points, ...props }: ComposedChartProps) {
    return (
      <Chart
        props={props}
        points={points}
        model={(width, theme) => composedChartModel({ ...props, width, bar: theme.bar })}
      />
    )
  }

  // The table's first column is the point's name, or its x value when
  // there is none; the model adds an x column after a name.
  function ScatterChart({ x, name, ...props }: ScatterChartProps) {
    return (
      <Chart
        props={{
          ...props,
          x: { key: name?.key ?? x.key, label: name ? (name.label ?? 'Name') : x.label },
        }}
        points
        model={(width) => scatterChartModel({ ...props, x, name, width })}
      />
    )
  }

  // A pie is one series whose values are also read as shares of the
  // whole, so the table, the summary and the sentence say "$120 (40%)".
  function PieChart({ value, colors, innerRadius, ...props }: PieChartProps) {
    const format = shareFormat(props.data, value.key, value.format)
    return (
      <Chart
        props={{ ...props, series: [{ key: value.key, label: value.label }], y: { format } }}
        colors={colors}
        model={(width) => pieChartModel({ ...props, value, innerRadius, width })}
      />
    )
  }

  function DonutChart({ innerRadius = 0.6, ...props }: PieChartProps) {
    return <PieChart {...props} innerRadius={innerRadius} />
  }

  // A funnel is the stage counts and, as a second series in the same table,
  // what each stage kept of the one before, each read in its own format.
  function FunnelChart({ value, ...props }: FunnelChartProps) {
    return (
      <Chart
        props={{ ...props, series: funnelSeries(value) }}
        model={(width) => funnelChartModel({ ...props, value, width })}
      />
    )
  }

  return {
    BarChart,
    LineChart,
    AreaChart,
    ComposedChart,
    ScatterChart,
    PieChart,
    DonutChart,
    FunnelChart,
  }
}
