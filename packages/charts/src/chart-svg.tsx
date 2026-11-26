// The SVG renderer: a chart model drawn with @hozo/svg, which is browser
// SVG on Web and react-native-svg on Native (RFC 015 §6). It only draws
// what the model already decided; nothing here computes a position.

import { Circle, G, Line, Path, Rect, Svg, SvgText } from '@hozo/svg'
import type { ChartModel, ChartSeries } from './model.ts'
import { seriesColor } from './palette.ts'

export interface ChartSvgProps {
  model: ChartModel
  series: readonly ChartSeries[]
  accessibilityLabel: string
  /** Whether a Line chart draws a dot at each value. */
  points?: boolean
  fontSize?: number
  /** Axis text and lines; inherits the surrounding text colour when absent. */
  textColor?: string
}

export function ChartSvg({
  model,
  series,
  accessibilityLabel,
  points = false,
  fontSize = 12,
  textColor,
}: ChartSvgProps) {
  const { plot } = model
  const ink = textColor ?? 'currentColor'
  const bottom = plot.y + plot.height
  return (
    <Svg
      width={model.width}
      height={model.height}
      viewBox={`0 0 ${model.width} ${model.height}`}
      accessibilityLabel={accessibilityLabel}
      {...(textColor ? { color: textColor } : {})}
    >
      <G>
        {model.yTicks.map((tick) => (
          <G key={`y${tick.label}`}>
            <Line
              x1={plot.x}
              x2={plot.x + plot.width}
              y1={tick.position}
              y2={tick.position}
              stroke={ink}
              strokeOpacity={0.15}
            />
            <SvgText
              x={plot.x - fontSize / 2}
              y={tick.position}
              dy={fontSize * 0.35}
              fill={ink}
              fontSize={fontSize}
              textAnchor="end"
            >
              {tick.label}
            </SvgText>
          </G>
        ))}
        {model.xTicks.map((tick) => (
          <SvgText
            key={`x${tick.position}`}
            x={tick.position}
            y={bottom + fontSize * 1.25}
            fill={ink}
            fontSize={fontSize}
            textAnchor="middle"
          >
            {tick.label}
          </SvgText>
        ))}
        <Line
          x1={plot.x}
          x2={plot.x + plot.width}
          y1={bottom}
          y2={bottom}
          stroke={ink}
          strokeOpacity={0.4}
        />
      </G>
      <G>
        {model.marks.map((mark) => {
          const color = seriesColor(mark.series, series[mark.series]?.color)
          switch (mark.kind) {
            case 'bar':
              return (
                <Rect
                  key={`b${mark.series}-${mark.datum}`}
                  x={mark.x}
                  y={mark.y}
                  width={mark.width}
                  height={mark.height}
                  fill={color}
                />
              )
            case 'line':
              return (
                <Path
                  key={`l${mark.series}`}
                  d={mark.path}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )
            case 'point':
              return points ? (
                <Circle
                  key={`p${mark.series}-${mark.datum}`}
                  cx={mark.cx}
                  cy={mark.cy}
                  r={3}
                  fill={color}
                />
              ) : null
          }
          return null
        })}
      </G>
    </Svg>
  )
}
