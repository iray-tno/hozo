// The SVG renderer: a chart model drawn with @hozo/svg, which is browser
// SVG on Web and react-native-svg on Native (RFC 015 §6). It only draws
// what the model already decided; nothing here computes a position. It
// carries no name: the box hides it from a screen reader, which reads the
// table of the data instead.

import { Circle, G, Line, Path, Rect, Svg, SvgText } from '@hozo/svg'
import { memo } from 'react'
import { datumRows, tooltipBox } from './active.ts'
import type { ChartModel, ChartSeries } from './model.ts'
import { seriesColor } from './palette.ts'

export interface ChartSvgProps {
  model: ChartModel
  series: readonly ChartSeries[]
  /** Whether a Line chart draws a dot at each value. */
  points?: boolean
  fontSize?: number
  /** Axis text and lines; inherits the surrounding text colour when absent. */
  textColor?: string
  /** The datum the keyboard, pointer or touch is on; its tooltip is drawn. */
  active?: number
  format?: (value: number) => string
  /** A pie's slice colours, by datum; the default palette fills the rest. */
  colors?: readonly string[]
}

export function ChartSvg({
  model,
  series,
  points = false,
  fontSize = 12,
  textColor,
  active,
  format,
  colors,
}: ChartSvgProps) {
  const ink = textColor ?? 'currentColor'
  return (
    <Svg
      width={model.width}
      height={model.height}
      viewBox={`0 0 ${model.width} ${model.height}`}
      {...(textColor ? { color: textColor } : {})}
    >
      <Drawing
        model={model}
        series={series}
        points={points}
        fontSize={fontSize}
        ink={ink}
        colors={colors}
      />
      {active !== undefined && active >= 0 && active < model.categories.length ? (
        <Tooltip
          model={model}
          series={series}
          datum={active}
          fontSize={fontSize}
          ink={ink}
          format={format}
          points={points}
          colors={colors}
        />
      ) : null}
    </Svg>
  )
}

/**
 * The axes and the marks: everything but the tooltip. Memoised, because the
 * active datum changes on every key press and pointer move while this does
 * not, and re-reconciling one element per mark on each step is what made a
 * step cost grow with the data (docs/measurements/charts-scale.md).
 */
const Drawing = memo(function Drawing({
  model,
  series,
  points,
  fontSize,
  ink,
  colors,
}: {
  model: ChartModel
  series: readonly ChartSeries[]
  points: boolean
  fontSize: number
  ink: string
  colors?: readonly string[]
}) {
  const { plot, radial, horizontal } = model
  const bottom = plot.y + plot.height
  // Gridlines run across the value axis: horizontal for upright charts,
  // vertical when the bars lie down. The category axis has none.
  return (
    <>
      <G>
        {model.yTicks.map((tick) => (
          <G key={`y${tick.label}`}>
            {horizontal ? null : (
              <Line
                x1={plot.x}
                x2={plot.x + plot.width}
                y1={tick.position}
                y2={tick.position}
                stroke={ink}
                strokeOpacity={0.15}
              />
            )}
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
          <G key={`x${tick.position}`}>
            {horizontal ? (
              <Line
                x1={tick.position}
                x2={tick.position}
                y1={plot.y}
                y2={bottom}
                stroke={ink}
                strokeOpacity={0.15}
              />
            ) : null}
            <SvgText
              x={tick.position}
              y={bottom + fontSize * 1.25}
              fill={ink}
              fontSize={fontSize}
              textAnchor="middle"
            >
              {tick.label}
            </SvgText>
          </G>
        ))}
        {radial ? null : horizontal ? (
          <Line x1={plot.x} x2={plot.x} y1={plot.y} y2={bottom} stroke={ink} strokeOpacity={0.4} />
        ) : (
          <Line
            x1={plot.x}
            x2={plot.x + plot.width}
            y1={bottom}
            y2={bottom}
            stroke={ink}
            strokeOpacity={0.4}
          />
        )}
      </G>
      <G>
        {model.marks.map((mark) => {
          const color = markColor(mark, series, colors)
          switch (mark.kind) {
            case 'arc':
              return <Path key={`s${mark.datum}`} d={mark.path} fill={color} />
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
            case 'area':
              // A series of lone values has no band to fill.
              return mark.path ? (
                <Path
                  key={`f${mark.series}`}
                  d={mark.path}
                  fill={color}
                  fillOpacity={mark.opacity}
                />
              ) : null
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
      {radial ? (
        <G>
          {radial.legend.map((entry) => (
            <G key={`k${entry.datum}`}>
              <Rect
                x={entry.x}
                y={entry.y + (fontSize * 1.6 - radial.swatch) / 2}
                width={radial.swatch}
                height={radial.swatch}
                fill={seriesColor(entry.tone, colors?.[entry.datum])}
              />
              <SvgText
                x={entry.x + radial.swatch + fontSize / 2}
                y={entry.y + fontSize * 1.15}
                fill={ink}
                fontSize={fontSize}
              >
                {entry.label}
              </SvgText>
            </G>
          ))}
        </G>
      ) : null}
    </>
  )
})

function sliceColor(
  model: ChartModel,
  datum: number,
  colors?: readonly string[],
): string | undefined {
  const mark = model.marks.find((entry) => entry.kind === 'arc' && entry.datum === datum)
  return mark?.kind === 'arc' ? seriesColor(mark.tone, colors?.[datum]) : undefined
}

/** A slice takes its datum's colour; a bar, line or dot its series'. */
function markColor(
  mark: ChartModel['marks'][number],
  series: readonly ChartSeries[],
  colors?: readonly string[],
): string {
  return mark.kind === 'arc'
    ? seriesColor(mark.tone, colors?.[mark.datum])
    : seriesColor(mark.series, series[mark.series]?.color)
}

/**
 * The active datum: a band behind it, a ring on each line's value, and a
 * box listing every series there. Dark with light text so it reads on a
 * light or a dark page alike; the swatch is not the only cue, as each row
 * names its series.
 */
function Tooltip({
  model,
  series,
  datum,
  fontSize,
  ink,
  format,
  points,
  colors,
}: {
  model: ChartModel
  series: readonly ChartSeries[]
  datum: number
  fontSize: number
  ink: string
  format?: (value: number) => string
  points: boolean
  colors?: readonly string[]
}) {
  const title = model.categories[datum] ?? ''
  const rows = datumRows(model, series, datum, format).map((row) =>
    model.radial ? { ...row, color: sliceColor(model, datum, colors) ?? row.color } : row,
  )
  const box = tooltipBox(model, title, rows, fontSize, datum)
  const center = model.centers[datum] as number
  const band =
    model.centers.length > 1
      ? Math.abs((model.centers[1] as number) - (model.centers[0] as number))
      : model.plot.width
  return (
    <G>
      {model.radial ? (
        model.marks.map((mark) =>
          mark.kind === 'arc' && mark.datum === datum ? (
            <Path key="active" d={mark.path} fill="none" stroke={ink} strokeWidth={2} />
          ) : null,
        )
      ) : model.horizontal ? (
        <Rect
          x={model.plot.x}
          y={center - band / 2}
          width={model.plot.width}
          height={band}
          fill={ink}
          fillOpacity={0.08}
        />
      ) : (
        <Rect
          x={center - band / 2}
          y={model.plot.y}
          width={band}
          height={model.plot.height}
          fill={ink}
          fillOpacity={0.08}
        />
      )}
      {model.marks.map((mark) =>
        mark.kind === 'point' && mark.datum === datum ? (
          <Circle
            key={`a${mark.series}`}
            cx={mark.cx}
            cy={mark.cy}
            r={points ? 5 : 4}
            fill="#ffffff"
            stroke={rows[mark.series]?.color}
            strokeWidth={2}
          />
        ) : null,
      )}
      <Rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={4}
        fill="#111827"
        fillOpacity={0.92}
      />
      <SvgText
        x={box.x + box.padding}
        y={box.y + box.padding + box.lineHeight * 0.75}
        fill="#ffffff"
        fontSize={fontSize}
        fontWeight="bold"
      >
        {title}
      </SvgText>
      {rows.map((row, i) => {
        const baseline = box.y + box.padding + box.lineHeight * (i + 1.75)
        return (
          <G key={row.label}>
            <Rect
              x={box.x + box.padding}
              y={baseline - fontSize * 0.75}
              width={fontSize * 0.7}
              height={fontSize * 0.7}
              fill={row.color}
            />
            <SvgText
              x={box.x + box.padding + fontSize}
              y={baseline}
              fill="#ffffff"
              fontSize={fontSize}
            >
              {`${row.label}: ${row.value}`}
            </SvgText>
          </G>
        )
      })}
    </G>
  )
}
