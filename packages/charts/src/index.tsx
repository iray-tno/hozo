import { ChartBox } from './chart-box.tsx'
import { createCharts } from './charts.tsx'
import { createSparkline } from './sparkline.tsx'

export const { BarChart, LineChart, AreaChart, PieChart, DonutChart } = createCharts(ChartBox)
// The root's own name makes it one image on Web.
export const Sparkline = createSparkline({})
export { datumSentence, nextDatum } from './active.ts'
export type { AreaChartProps, BarChartProps, LineChartProps, PieChartProps } from './charts.tsx'
export {
  type AreaChartInput,
  areaChartModel,
  areaPath,
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
export { NO_VALUE } from './no-value.ts'
export { DEFAULT_PALETTE, seriesColor } from './palette.ts'
export {
  arcPath,
  type PieChartInput,
  type PieModel,
  type PieValue,
  pieChartModel,
  shareFormat,
} from './pie.ts'
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
export {
  type SparklineInput,
  type SparklineModel,
  type SparklineProps,
  sparklineModel,
  sparklineSummary,
} from './sparkline.tsx'
export { chartSummary, TABLE_ROW_LIMIT } from './summary.ts'
