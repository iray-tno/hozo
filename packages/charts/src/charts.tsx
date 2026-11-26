// The public charts (RFC 015 §3): a model from the data, laid out at the
// box's width, drawn by the SVG renderer, with the table of the same data
// for a screen reader.
//
// The box is the one platform-specific piece (a measured `<div>` on Web, a
// `View` with `onLayout` on Native), so each entry point passes its own in
// rather than this module importing one: an explicit `.tsx` import would
// pick the Web half on Native too.

import type { ComponentType, ReactNode } from 'react'
import { ChartSvg } from './chart-svg.tsx'
import { ChartTable } from './chart-table.tsx'
import {
  type BarChartInput,
  barChartModel,
  type ChartInput,
  type ChartModel,
  lineChartModel,
} from './model.ts'

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
  /** Show the table of the data under the chart, not only to a screen reader. */
  showTable?: boolean
}

export type BarChartProps = Common & Pick<BarChartInput, 'stacked'>

export type LineChartProps = Common & {
  /** Draw a dot at each value. */
  points?: boolean
}

export interface ChartBoxComponentProps {
  width?: number
  height: number
  children: (width: number) => ReactNode
  table: ReactNode
  showTable?: boolean
}

export function createCharts(ChartBox: ComponentType<ChartBoxComponentProps>) {
  function Chart({
    props,
    model,
    points,
  }: {
    props: Common
    model: (width: number) => ChartModel
    points?: boolean
  }) {
    const { accessibilityLabel, width, textColor, showTable, height, series, fontSize, x, y } =
      props
    // The table does not depend on the width, so it is built once from a
    // model at any width rather than waiting for the box to be measured: a
    // screen reader and server rendering both get it on the first pass.
    const table = (
      <ChartTable
        model={model(width ?? 1)}
        series={series}
        accessibilityLabel={accessibilityLabel}
        categoryLabel={x.label}
        format={y?.format}
      />
    )
    return (
      <ChartBox width={width} height={height} table={table} showTable={showTable}>
        {(at) => (
          <ChartSvg
            model={model(at)}
            series={series}
            points={points}
            fontSize={fontSize}
            textColor={textColor}
          />
        )}
      </ChartBox>
    )
  }

  function BarChart({ stacked, ...props }: BarChartProps) {
    return <Chart props={props} model={(width) => barChartModel({ ...props, stacked, width })} />
  }

  function LineChart({ points, ...props }: LineChartProps) {
    return (
      <Chart props={props} points={points} model={(width) => lineChartModel({ ...props, width })} />
    )
  }

  return { BarChart, LineChart }
}
