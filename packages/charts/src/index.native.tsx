import { ChartBox } from './chart-box.native.tsx'
import { createCharts } from './charts.tsx'
import { useSystemScheme } from './color-scheme.native.ts'
import { useReducedMotion } from './reduced-motion.native.ts'
import { createSparkline } from './sparkline.tsx'

export const { BarChart, LineChart, AreaChart, ComposedChart, ScatterChart, PieChart, DonutChart } =
  createCharts(ChartBox, useSystemScheme, useReducedMotion)
// react-native-svg takes the name as a view prop; the view must also be one element.
export const Sparkline = createSparkline(
  { accessible: true, accessibilityRole: 'image' },
  useSystemScheme,
)
export { datumSentence, datumTitle, nextDatum } from './active.ts'
export type {
  AreaChartProps,
  BarChartProps,
  ComposedChartProps,
  LineChartProps,
  PieChartProps,
  ScatterChartProps,
} from './charts.tsx'
export {
  type AreaChartInput,
  areaChartModel,
  areaPath,
  BAR_MAX,
  type BarChartInput,
  type BarEnd,
  type BarShape,
  barChartModel,
  barPath,
  type ChartInput,
  type ChartModel,
  type ChartSeries,
  type ChartXAxis,
  type ChartYAxis,
  type ComposedChartInput,
  type ComposedSeries,
  type Curve,
  composedChartModel,
  estimateTextWidth,
  type LegendKey,
  type LineChartInput,
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
  type ScatterChartInput,
  type ScatterName,
  type ScatterXAxis,
  scatterChartModel,
} from './scatter.ts'
export {
  type SparklineInput,
  type SparklineModel,
  type SparklineProps,
  sparklineModel,
  sparklineSummary,
} from './sparkline.tsx'
export { chartSummary, TABLE_ROW_LIMIT } from './summary.ts'
export { ChartSync, type ChartSyncProps } from './sync.tsx'
export {
  type ChartPalette,
  type ChartTheme,
  ChartThemeProvider,
  type ChartThemeProviderProps,
  type ColorScheme,
  DEFAULT_THEME,
  mergeTheme,
  type ResolvedChartTheme,
  resolveTheme,
} from './theme.tsx'
export type { TimeZone } from './time.ts'
