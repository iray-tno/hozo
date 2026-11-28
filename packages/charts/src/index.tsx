import { BrushBox } from './brush-box.tsx'
import { ChartBox } from './chart-box.tsx'
import { createCharts } from './charts.tsx'
import { useSystemScheme } from './color-scheme.ts'
import { useReducedMotion } from './reduced-motion.ts'
import { createSparkline } from './sparkline.tsx'

export const {
  BarChart,
  LineChart,
  AreaChart,
  ComposedChart,
  ScatterChart,
  PieChart,
  DonutChart,
  FunnelChart,
} = createCharts(ChartBox, useSystemScheme, useReducedMotion, BrushBox)
// The root's own name makes it one image on Web.
export const Sparkline = createSparkline({}, useSystemScheme)
export { datumSentence, datumTitle, nextDatum } from './active.ts'
export {
  type BrushModel,
  type BrushRange,
  brushModel,
  clampRange,
  dragTo,
  grabAt,
  moveEnd,
  rangeNote,
} from './brush.ts'
export type {
  AreaChartProps,
  BarChartProps,
  BrushBoxComponentProps,
  BrushOptions,
  ComposedChartProps,
  FunnelChartProps,
  LineChartProps,
  PieChartProps,
  ScatterChartProps,
} from './charts.tsx'
export {
  type Funnel,
  type FunnelChartInput,
  type FunnelLabel,
  type FunnelModel,
  type FunnelValue,
  funnelChartModel,
  KEPT_LABEL,
  keptFractions,
} from './funnel.ts'
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
