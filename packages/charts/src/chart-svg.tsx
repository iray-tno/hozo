// The SVG renderer: a chart model drawn with @hozo/svg, which is browser
// SVG on Web and react-native-svg on Native (RFC 015 §6). It only draws
// what the model already decided; nothing here computes a position. It
// carries no name: the box hides it from a screen reader, which reads the
// table of the data instead.

import { Circle, G, Line, Path, Rect, Svg, SvgText } from '@hozo/svg'
import { memo } from 'react'
import { datumRows, datumTitle, tooltipBox } from './active.ts'
import {
  barPath,
  type ChartModel,
  type ChartSeries,
  EDGE_PAD,
  type PlacedReference,
} from './model.ts'
import { seriesColor } from './palette.ts'
import { arcPath } from './pie.ts'
import { sweepPath } from './radial-bar.ts'
import { DEFAULT_THEME, type ResolvedChartTheme } from './theme.tsx'

// The frame recedes so the data is the loudest thing on the chart. Gridlines
// and the baseline are a fraction of the surrounding text colour rather than
// a colour of their own, so one value works on a light page and a dark one,
// on Web and on Native; the theme sets how far.
/**
 * Value tick labels, quieter than category names but still text: 0.8 of
 * slate-700 or slate-600 text keeps 4.5:1 on white; 0.7 of slate-700 fell to 4.2.
 */
const MUTED = 0.8

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
  /** Palette, bar shape, line weight and frame; the defaults when absent. */
  look?: ResolvedChartTheme
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
  look = DEFAULT_THEME,
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
        look={look}
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
          look={look}
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
  look,
}: {
  model: ChartModel
  series: readonly ChartSeries[]
  points: boolean
  fontSize: number
  ink: string
  look: ResolvedChartTheme
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
                strokeOpacity={look.frame.grid}
              />
            )}
            <SvgText
              x={plot.x - fontSize / 2}
              y={tick.position}
              dy={fontSize * 0.35}
              fill={ink}
              fillOpacity={horizontal ? 1 : MUTED}
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
                strokeOpacity={look.frame.grid}
              />
            ) : null}
            <SvgText
              x={
                tick.anchor === 'end'
                  ? model.width - EDGE_PAD
                  : tick.anchor === 'start'
                    ? EDGE_PAD
                    : tick.position
              }
              y={bottom + fontSize * 1.25}
              fill={ink}
              fillOpacity={horizontal || model.xColumn ? MUTED : 1}
              fontSize={fontSize}
              textAnchor={tick.anchor ?? 'middle'}
            >
              {tick.label}
            </SvgText>
          </G>
        ))}
        {radial ||
        model.funnel ||
        model.tree ||
        model.radar ||
        model.radialBar ? null : horizontal ? (
          <Line
            x1={plot.x}
            x2={plot.x}
            y1={plot.y}
            y2={bottom}
            stroke={ink}
            strokeOpacity={look.frame.axis}
          />
        ) : (
          <Line
            x1={plot.x}
            x2={plot.x + plot.width}
            y1={bottom}
            y2={bottom}
            stroke={ink}
            strokeOpacity={look.frame.axis}
          />
        )}
      </G>
      {model.radialBar ? (
        <G>
          {/* Each ring's full sweep as a track, so a bar's length reads against it. */}
          {model.radialBar.rings.map((ring, i) => (
            <Path
              // biome-ignore lint/suspicious/noArrayIndexKey: one ring per row, in data order
              key={`k${i}`}
              d={arcPath(
                model.radialBar?.cx ?? 0,
                model.radialBar?.cy ?? 0,
                ring.outer,
                ring.inner,
                0,
                model.radialBar?.sweep ?? 0,
              )}
              fill={ink}
              fillOpacity={look.frame.grid}
            />
          ))}
          {model.radialBar.ticks.map((tick) => (
            <SvgText
              key={`t${tick.label}`}
              x={tick.x}
              y={tick.y}
              fill={ink}
              fillOpacity={MUTED}
              fontSize={fontSize}
              textAnchor={tick.anchor}
            >
              {tick.label}
            </SvgText>
          ))}
          {model.radialBar.labels.map((label) => (
            <SvgText
              key={`n${label.datum}`}
              x={label.x}
              y={label.y}
              fill={ink}
              fontSize={fontSize}
              textAnchor="end"
            >
              {label.text}
            </SvgText>
          ))}
        </G>
      ) : null}
      {model.radar ? (
        <G>
          {model.radar.rings.map((ring) => (
            <Path
              key={`g${ring.label}`}
              d={ring.path}
              fill="none"
              stroke={ink}
              strokeOpacity={look.frame.grid}
            />
          ))}
          {model.radar.spokes.map((end, i) => (
            <Line
              // biome-ignore lint/suspicious/noArrayIndexKey: one spoke per row, in data order
              key={`s${i}`}
              x1={model.radar?.cx}
              y1={model.radar?.cy}
              x2={end.x}
              y2={end.y}
              stroke={ink}
              strokeOpacity={look.frame.grid}
            />
          ))}
          {model.radar.labels.map((label) => (
            <SvgText
              key={`n${label.datum}`}
              x={label.x}
              y={label.y}
              fill={ink}
              fontSize={fontSize}
              textAnchor={label.anchor}
            >
              {label.text}
            </SvgText>
          ))}
        </G>
      ) : null}
      {/* Bands under the marks, so the data stays on top of a range. */}
      <G>
        {model.references.map((reference) =>
          reference.end === undefined ? null : (
            <ReferenceBand
              key={`r${reference.label}`}
              reference={reference}
              model={model}
              ink={ink}
              fontSize={fontSize}
            />
          ),
        )}
      </G>
      <G>
        {model.marks.map((mark) => {
          const color = markColor(mark, series, colors, look.palette)
          switch (mark.kind) {
            case 'arc':
              return <Path key={`s${mark.datum}`} d={mark.path} fill={color} />
            case 'stage':
              return <Path key={`t${mark.datum}`} d={mark.path} fill={color} />
            case 'sweep':
              return <Path key={`w${mark.series}-${mark.datum}`} d={sweepPath(mark)} fill={color} />
            case 'cell':
              return (
                <Rect
                  key={`c${mark.datum}`}
                  x={mark.x}
                  y={mark.y}
                  width={mark.width}
                  height={mark.height}
                  rx={2}
                  fill={color}
                />
              )
            case 'bar':
              return mark.end ? (
                <Path
                  key={`b${mark.series}-${mark.datum}`}
                  d={barPath(mark.x, mark.y, mark.width, mark.height, mark.end, look.bar.radius)}
                  fill={color}
                />
              ) : (
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
                  strokeWidth={look.line.width}
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
                  r={look.line.pointRadius}
                  fill={color}
                />
              ) : null
          }
          return null
        })}
      </G>
      {/* A radar's ring values over the fills, which would otherwise hide them. */}
      {model.radar ? (
        <G>
          {model.radar.rings.map((ring) => (
            <SvgText
              key={`v${ring.label}`}
              x={ring.x}
              y={ring.y}
              dy={fontSize * 0.35}
              fill={ink}
              fillOpacity={MUTED}
              fontSize={fontSize}
            >
              {ring.label}
            </SvgText>
          ))}
        </G>
      ) : null}
      {/* Lines over the marks, so a target is seen across the bars. */}
      <G>
        {model.references.map((reference) =>
          reference.end === undefined ? (
            <ReferenceLine
              key={`r${reference.label}`}
              reference={reference}
              model={model}
              ink={ink}
              fontSize={fontSize}
            />
          ) : null,
        )}
      </G>
      {model.legend?.length ? (
        <SeriesLegend model={model} series={series} fontSize={fontSize} ink={ink} look={look} />
      ) : null}
      {model.funnel ? (
        <G>
          {model.funnel.labels.map((label) => (
            <SvgText
              key={`n${label.datum}${label.anchor}`}
              x={label.x}
              y={label.y}
              fill={ink}
              fillOpacity={label.anchor === 'start' ? MUTED : 1}
              fontSize={fontSize}
              textAnchor={label.anchor}
            >
              {label.text}
            </SvgText>
          ))}
        </G>
      ) : null}
      {model.tree ? (
        <G>
          {model.tree.labels.map((label) => (
            <SvgText
              key={`n${label.datum}-${label.y}`}
              x={label.x}
              y={label.y}
              fill={label.fill}
              fontSize={fontSize}
            >
              {label.text}
            </SvgText>
          ))}
          {model.tree.legend.map((key) => (
            <G key={`k${key.series}`}>
              <Rect
                x={key.x + fontSize * 0.125}
                y={key.y + fontSize * 0.8 - fontSize * 0.375}
                width={fontSize * 0.75}
                height={fontSize * 0.75}
                rx={2}
                fill={seriesColor(key.series, colors?.[key.series], look.palette)}
              />
              <SvgText
                x={key.x + fontSize * 1.5}
                y={key.y + fontSize * 0.8}
                dy={fontSize * 0.35}
                fill={ink}
                fontSize={fontSize}
              >
                {key.label}
              </SvgText>
            </G>
          ))}
        </G>
      ) : null}
      {radial ? (
        <G>
          {radial.legend.map((entry) => (
            <G key={`k${entry.datum}`}>
              <Rect
                x={entry.x}
                y={entry.y + (fontSize * 1.6 - radial.swatch) / 2}
                width={radial.swatch}
                height={radial.swatch}
                fill={seriesColor(entry.tone, colors?.[entry.datum], look.palette)}
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

/**
 * The key above the plot. Each swatch has the shape of its series' mark, a
 * block for bars, a stroke for a line, a dot for points, so a bars-and-line
 * chart's key says which is which before colour does.
 */
function SeriesLegend({
  model,
  series,
  fontSize,
  ink,
  look,
}: {
  model: ChartModel
  series: readonly ChartSeries[]
  fontSize: number
  ink: string
  look: ResolvedChartTheme
}) {
  const shapes = new Map<number, 'bar' | 'line' | 'point'>()
  for (const mark of model.marks)
    if (mark.kind === 'bar' || mark.kind === 'line' || mark.kind === 'area')
      shapes.set(mark.series, mark.kind === 'bar' ? 'bar' : (shapes.get(mark.series) ?? 'line'))
    else if (mark.kind === 'point' && !shapes.has(mark.series)) shapes.set(mark.series, 'point')
  const middle = fontSize * 0.8
  return (
    <G>
      {(model.legend ?? []).map((key) => {
        const color = seriesColor(key.series, series[key.series]?.color, look.palette)
        const shape = shapes.get(key.series) ?? 'bar'
        const cy = key.y + middle
        return (
          <G key={`k${key.series}`}>
            {shape === 'line' ? (
              <Line
                x1={key.x}
                x2={key.x + fontSize}
                y1={cy}
                y2={cy}
                stroke={color}
                strokeWidth={look.line.width}
                strokeLinecap="round"
              />
            ) : shape === 'point' ? (
              <Circle cx={key.x + fontSize / 2} cy={cy} r={look.line.pointRadius} fill={color} />
            ) : (
              <Rect
                x={key.x + fontSize * 0.125}
                y={cy - fontSize * 0.375}
                width={fontSize * 0.75}
                height={fontSize * 0.75}
                rx={2}
                fill={color}
              />
            )}
            <SvgText
              x={key.x + fontSize * 1.5}
              y={cy}
              dy={fontSize * 0.35}
              fill={ink}
              fontSize={fontSize}
            >
              {key.label}
            </SvgText>
          </G>
        )
      })}
    </G>
  )
}

interface ReferenceProps {
  reference: PlacedReference
  model: ChartModel
  ink: string
  fontSize: number
}

/** A dashed line across the plot, labelled outside it. */
function ReferenceLine({ reference, model, ink, fontSize }: ReferenceProps) {
  const { plot, horizontal } = model
  const at = reference.start
  return (
    <G>
      <Line
        x1={horizontal ? at : plot.x}
        x2={horizontal ? at : plot.x + plot.width}
        y1={horizontal ? plot.y : at}
        y2={horizontal ? plot.y + plot.height : at}
        stroke={ink}
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <ReferenceLabel reference={reference} model={model} ink={ink} fontSize={fontSize} />
    </G>
  )
}

/** A shaded range across the plot, labelled outside it. */
function ReferenceBand({ reference, model, ink, fontSize }: ReferenceProps) {
  const { plot, horizontal } = model
  const lo = Math.min(reference.start, reference.end ?? reference.start)
  const size = Math.abs((reference.end ?? reference.start) - reference.start)
  return (
    <G>
      <Rect
        x={horizontal ? lo : plot.x}
        y={horizontal ? plot.y : lo}
        width={horizontal ? size : plot.width}
        height={horizontal ? plot.height : size}
        fill={ink}
        fillOpacity={0.06}
      />
      <ReferenceLabel reference={reference} model={model} ink={ink} fontSize={fontSize} />
    </G>
  )
}

/**
 * The label outside the plot, where the model left room for it: right of
 * an upright chart, level with the line or the band's middle, or above a
 * horizontal one. Inside, it would cover the data it is read against.
 */
function ReferenceLabel({ reference, model, ink, fontSize }: ReferenceProps) {
  const { plot, horizontal } = model
  const at = reference.end === undefined ? reference.start : (reference.start + reference.end) / 2
  return horizontal ? (
    <SvgText x={at} y={plot.y - fontSize / 2} fill={ink} fontSize={fontSize} textAnchor="middle">
      {reference.label}
    </SvgText>
  ) : (
    <SvgText
      x={plot.x + plot.width + fontSize / 2}
      y={at}
      dy={fontSize * 0.35}
      fill={ink}
      fontSize={fontSize}
    >
      {reference.label}
    </SvgText>
  )
}

function sliceColor(
  model: ChartModel,
  datum: number,
  colors: readonly string[] | undefined,
  palette: readonly string[],
): string | undefined {
  const mark = model.marks.find((entry) => entry.kind === 'arc' && entry.datum === datum)
  return mark?.kind === 'arc' ? seriesColor(mark.tone, colors?.[datum], palette) : undefined
}

/**
 * A slice takes its datum's colour, a treemap cell its top-level group's;
 * a bar, line or dot its series'.
 */
function markColor(
  mark: ChartModel['marks'][number],
  series: readonly ChartSeries[],
  colors: readonly string[] | undefined,
  palette: readonly string[],
): string {
  if (mark.kind === 'arc') return seriesColor(mark.tone, colors?.[mark.datum], palette)
  if (mark.kind === 'cell') return seriesColor(mark.tone, colors?.[mark.tone], palette)
  return seriesColor(mark.series, series[mark.series]?.color, palette)
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
  look,
}: {
  model: ChartModel
  series: readonly ChartSeries[]
  datum: number
  fontSize: number
  ink: string
  look: ResolvedChartTheme
  format?: (value: number) => string
  points: boolean
  colors?: readonly string[]
}) {
  const title = datumTitle(model, datum)
  const tone = model.tree?.tone[datum]
  const rows = datumRows(model, series, datum, format, look.palette).map((row) =>
    model.radial
      ? { ...row, color: sliceColor(model, datum, colors, look.palette) ?? row.color }
      : tone !== undefined
        ? { ...row, color: seriesColor(tone, colors?.[tone], look.palette) }
        : row,
  )
  const outline = model.tree?.rects[datum]
  const box = tooltipBox(model, title, rows, fontSize, datum)
  const center = model.centers[datum] as number
  const band =
    model.centers.length > 1
      ? Math.abs((model.centers[1] as number) - (model.centers[0] as number))
      : model.plot.width
  return (
    <G>
      {model.radialBar ? (
        <Path
          d={arcPath(
            model.radialBar.cx,
            model.radialBar.cy,
            (model.radialBar.rings[datum]?.outer ?? 0) + 1,
            Math.max(0, (model.radialBar.rings[datum]?.inner ?? 0) - 1),
            0,
            model.radialBar.sweep,
          )}
          fill="none"
          stroke={ink}
          strokeWidth={2}
        />
      ) : model.radar ? (
        <Line
          x1={model.radar.cx}
          y1={model.radar.cy}
          x2={model.radar.spokes[datum]?.x}
          y2={model.radar.spokes[datum]?.y}
          stroke={ink}
          strokeOpacity={0.5}
          strokeWidth={2}
        />
      ) : model.tree ? (
        outline ? (
          <Rect
            x={outline.x - 1}
            y={outline.y - 1}
            width={outline.width + 2}
            height={outline.height + 2}
            rx={3}
            fill="none"
            stroke={ink}
            strokeWidth={2}
          />
        ) : null
      ) : model.radial ? (
        model.marks.map((mark) =>
          mark.kind === 'arc' && mark.datum === datum ? (
            <Path key="active" d={mark.path} fill="none" stroke={ink} strokeWidth={2} />
          ) : null,
        )
      ) : model.xColumn ? null : model.horizontal ? (
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
            r={look.line.pointRadius + (points ? 1 : 0)}
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
            {/* A funnel's or a treemap's share has no mark of its own, so no colour to match. */}
            {(model.funnel || model.tree) && i > 0 ? null : (
              <Rect
                x={box.x + box.padding}
                y={baseline - fontSize * 0.75}
                width={fontSize * 0.7}
                height={fontSize * 0.7}
                fill={row.color}
              />
            )}
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
