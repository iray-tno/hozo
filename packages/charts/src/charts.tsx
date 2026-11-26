// The public charts (RFC 015 §3): a model from the data, laid out at the
// box's width, drawn by the SVG renderer.
//
// The box is the one platform-specific piece (a measured `<div>` on Web, a
// `View` with `onLayout` on Native), so each entry point passes its own in
// rather than this module importing one: an explicit `.tsx` import would
// pick the Web half on Native too.

import type { ComponentType, ReactNode } from 'react'
import { ChartSvg } from './chart-svg.tsx'
import { type BarChartInput, barChartModel, type ChartInput, lineChartModel } from './model.ts'

type Common = Omit<ChartInput, 'width'> & {
  /** Names the chart for a screen reader. Required: an unnamed chart is a picture of nothing. */
  accessibilityLabel: string
  /** A fixed width; otherwise the chart fills its container. */
  width?: number
  /** Axis text and lines; inherits the surrounding text colour on Web when absent. */
  textColor?: string
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
}

export function createCharts(ChartBox: ComponentType<ChartBoxComponentProps>) {
  function BarChart({ accessibilityLabel, width, textColor, ...input }: BarChartProps) {
    return (
      <ChartBox width={width} height={input.height}>
        {(at) => (
          <ChartSvg
            model={barChartModel({ ...input, width: at })}
            series={input.series}
            accessibilityLabel={accessibilityLabel}
            fontSize={input.fontSize}
            textColor={textColor}
          />
        )}
      </ChartBox>
    )
  }

  function LineChart({ accessibilityLabel, width, textColor, points, ...input }: LineChartProps) {
    return (
      <ChartBox width={width} height={input.height}>
        {(at) => (
          <ChartSvg
            model={lineChartModel({ ...input, width: at })}
            series={input.series}
            accessibilityLabel={accessibilityLabel}
            points={points}
            fontSize={input.fontSize}
            textColor={textColor}
          />
        )}
      </ChartBox>
    )
  }

  return { BarChart, LineChart }
}
