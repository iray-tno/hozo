// The public charts (RFC 015 §3): a model from the data, laid out at the
// box's width, drawn by the SVG renderer, with the table of the same data
// for a screen reader.
//
// The box is the one platform-specific piece (a measured `<div>` on Web, a
// `View` with `onLayout` on Native), so each entry point passes its own in
// rather than this module importing one: an explicit `.tsx` import would
// pick the Web half on Native too.

import { type ComponentType, type ReactNode, useId, useMemo, useState } from 'react'
import { datumSentence, nextDatum } from './active.ts'
import { type BrushModel, type BrushRange, brushModel, clampRange, rangeNote } from './brush.ts'
import { BrushSvg } from './brush-svg.tsx'
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
  categoriesOf,
  composedChartModel,
  lineChartModel,
  rowValue,
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

export interface BrushOptions {
  /** The rows shown, controlled; pair it with `onRangeChange`. */
  range?: BrushRange
  /** The rows shown at first when `range` is not given; all of them by default. */
  defaultRange?: BrushRange
  onRangeChange?: (range: BrushRange) => void
  /** The strip's height; 40 by default. */
  height?: number
}

type Brushable = {
  /**
   * A strip under the chart that picks which run of rows it shows, each end
   * a slider. `true` starts with every row; the summary and the table say
   * which are shown.
   */
  brush?: boolean | BrushOptions
}

export type BarChartProps = Common & Brushable & Pick<BarChartInput, 'stacked' | 'horizontal'>

export type LineChartProps = Common &
  Brushable & {
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

export type ComposedChartProps = Omit<Common, 'series'> &
  Brushable & {
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

/** What the brush's box wires to the platform's focus, keys, pointer and touch. */
export interface BrushBoxComponentProps {
  width?: number
  height: number
  /** The chart's name, which the group of the two ends is named after. */
  label: string
  count: number
  range: BrushRange
  /** A row's name, read as an end's value. */
  valueText: (index: number) => string
  /** The strip laid out at a width, for finding the row under a press. */
  model: (width: number) => BrushModel
  children: (width: number) => ReactNode
  onRange: (range: BrushRange) => void
}

/** What a brushed chart is showing: a note for the summary and the run's ends for the table's name. */
interface Shown {
  /** The whole data, so the marks jump to a new range rather than slide between rows. */
  version: unknown
  note: string
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
  BrushBox?: ComponentType<BrushBoxComponentProps>,
) {
  function Chart({
    props,
    model,
    points,
    colors,
    shown,
  }: {
    props: Common
    model: (width: number, theme: ResolvedChartTheme) => ChartModel
    points?: boolean
    colors?: readonly string[]
    shown?: Shown
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
    const summary = useMemo(() => {
      const text = chartSummary(data, series, y?.format, !withTable)
      return shown?.note ? `${shown.note} ${text}` : text
    }, [data, series, y?.format, withTable, shown?.note])
    // A brushed table is named with the run it lists, so it is not taken for the whole.
    const first = data.categories[0]
    const tableLabel =
      shown?.note && first !== undefined
        ? `${accessibilityLabel}, ${first} to ${data.categories[count - 1]}`
        : accessibilityLabel
    const table = useMemo(
      () =>
        withTable ? (
          <ChartTable
            model={data}
            series={series}
            accessibilityLabel={tableLabel}
            categoryLabel={x.label}
            format={y?.format}
          />
        ) : null,
      [withTable, data, series, tableLabel, x.label, y?.format],
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
            version={shown?.version ?? props.data}
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

  /**
   * The chart over the rows the brush picks, and the brush under it. The
   * range is the brush's own state unless `range` controls it; the strip
   * draws the whole of the first series, so the reader sees where to look.
   */
  function BrushedChart<P extends Common & Brushable>({
    props,
    draw,
  }: {
    props: P
    draw: (props: P, shown?: Shown) => ReactNode
  }) {
    const options = props.brush === true || !props.brush ? {} : props.brush
    const count = props.data.length
    const [own, setOwn] = useState(() => clampRange(options.defaultRange, count))
    const range = clampRange(options.range ?? own, count)
    const theme = useChartTheme(props.theme, useSystemScheme)
    const first = props.series[0]
    const values = useMemo(
      () => props.data.map((row) => (first ? rowValue(row, first.key) : undefined)),
      [props.data, first],
    )
    const categories = useMemo(() => categoriesOf({ ...props, width: 0 }), [props])
    const data = useMemo(
      () => props.data.slice(range.start, range.end + 1),
      [props.data, range.start, range.end],
    )
    const height = options.height ?? 40
    const strip = (width: number) => brushModel(values, range, width, height)
    return (
      <>
        {draw({ ...props, data }, { version: props.data, note: rangeNote(range, count) })}
        {BrushBox && count > 1 ? (
          <BrushBox
            width={props.width}
            height={height}
            label={props.accessibilityLabel}
            count={count}
            range={range}
            valueText={(index) => categories[index] ?? ''}
            model={strip}
            onRange={(next) => {
              if (next.start === range.start && next.end === range.end) return
              if (options.range === undefined) setOwn(next)
              options.onRangeChange?.(next)
            }}
          >
            {(width) => (
              <BrushSvg
                model={strip(width)}
                color={seriesColor(0, first?.color, theme.palette)}
                ink={props.textColor ?? 'currentColor'}
              />
            )}
          </BrushBox>
        ) : null}
      </>
    )
  }

  /** `draw` as a chart that takes `brush`: drawn as it is without one. */
  function brushable<P extends Common & Brushable>(draw: (props: P, shown?: Shown) => ReactNode) {
    return (props: P) => (props.brush ? <BrushedChart props={props} draw={draw} /> : draw(props))
  }

  const BarChart = brushable<BarChartProps>(({ stacked, horizontal, ...props }, shown) => (
    <Chart
      props={props}
      shown={shown}
      model={(width, theme) =>
        barChartModel({ ...props, stacked, horizontal, width, bar: theme.bar })
      }
    />
  ))

  const LineChart = brushable<LineChartProps>(({ points, ...props }, shown) => (
    <Chart
      props={props}
      shown={shown}
      points={points}
      model={(width) => lineChartModel({ ...props, width })}
    />
  ))

  const AreaChart = brushable<AreaChartProps>(({ points, stacked, ...props }, shown) => (
    <Chart
      props={props}
      shown={shown}
      points={points}
      model={(width) => areaChartModel({ ...props, stacked, width })}
    />
  ))

  const ComposedChart = brushable<ComposedChartProps>(({ points, ...props }, shown) => (
    <Chart
      props={props}
      shown={shown}
      points={points}
      model={(width, theme) => composedChartModel({ ...props, width, bar: theme.bar })}
    />
  ))

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
