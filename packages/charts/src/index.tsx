import { ChartBox } from './chart-box.tsx'
import { createCharts } from './charts.tsx'

export const { BarChart, LineChart } = createCharts(ChartBox)
export type { BarChartProps, LineChartProps } from './charts.tsx'
export {
  type BarChartInput,
  barChartModel,
  type ChartInput,
  type ChartModel,
  type ChartSeries,
  type ChartXAxis,
  type ChartYAxis,
  estimateTextWidth,
  lineChartModel,
  linePath,
  type Margin,
  type Mark,
  rowValue,
  type Tick,
} from './model.ts'
export { DEFAULT_PALETTE, seriesColor } from './palette.ts'
export {
  type BandOptions,
  type BandScale,
  bandScale,
  type LinearScale,
  linearScale,
  niceDomain,
  pointScale,
  type Range,
  tickIncrement,
  ticks,
} from './scale.ts'
