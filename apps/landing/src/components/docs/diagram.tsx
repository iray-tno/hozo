import { Svg } from '@hozo/svg'

// The parts the /docs diagrams are drawn from. They are Hozo's own `Svg`,
// written against the landing's tokens, which docs.css binds to Starlight's
// colours, so a diagram follows the theme switch as the header does; an
// `<img>` of an SVG file could only follow the system's.
//
// SVG has no wrapping, so a box's lines are given one by one and its size
// by hand.

export interface BoxProps {
  x: number
  y: number
  width: number
  height: number
  title: string
  lines?: readonly string[]
  /** The one box a diagram is about. */
  accent?: boolean
  /** Centre the text rather than start it at the left. */
  centered?: boolean
}

const TITLE = 15
const LINE = 13
const LEADING = 18
const INSET = 14

export function Box({ x, y, width, height, title, lines = [], accent, centered }: BoxProps) {
  // The text block's height, centred in the box.
  const block = TITLE + lines.length * LEADING
  const top = y + (height - block) / 2 + TITLE - 3
  const textX = centered ? x + width / 2 : x + INSET
  const anchor = centered ? 'middle' : 'start'
  return (
    <Svg.G>
      <Svg.Rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        className={
          accent
            ? 'fill-yakisugi-800 stroke-hinoki stroke-2'
            : 'fill-yakisugi-800 stroke-yakisugi-600'
        }
      />
      <Svg.Text
        x={textX}
        y={top}
        textAnchor={anchor}
        fontSize={TITLE}
        fontWeight={700}
        className={accent ? 'fill-hinoki' : 'fill-shikkui'}
      >
        {title}
      </Svg.Text>
      {lines.map((line, at) => (
        <Svg.Text
          key={line}
          x={textX}
          y={top + (at + 1) * LEADING}
          textAnchor={anchor}
          fontSize={LINE}
          className="fill-shikkui-muted"
        >
          {line}
        </Svg.Text>
      ))}
    </Svg.G>
  )
}

/**
 * A connector, given as `d`. With `marker`, it ends in that arrowhead;
 * without, it is a branch joining another connector partway.
 */
export function Arrow({ d, marker }: { d: string; marker?: string }) {
  return (
    <Svg.Path
      d={d}
      fill="none"
      markerEnd={marker ? `url(#${marker})` : undefined}
      className="stroke-shikkui-muted stroke-[1.5]"
    />
  )
}

/** The arrowhead `Arrow` points with; one per diagram, by a page-unique id. */
export function ArrowHead({ id }: { id: string }) {
  return (
    <Svg.Defs>
      <Svg.Marker
        id={id}
        viewBox="0 0 10 10"
        refX={9}
        refY={5}
        markerWidth={7}
        markerHeight={7}
        orient="auto"
      >
        <Svg.Path d="M0 0L10 5L0 10Z" className="fill-shikkui-muted" />
      </Svg.Marker>
    </Svg.Defs>
  )
}
