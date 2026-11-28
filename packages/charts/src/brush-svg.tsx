// The brush's drawing, shared by both boxes: the whole series as a thin
// line, the shown range as a lighter band, and a grip at each end. The
// boxes put the focusable ends over the grips; this only draws.

import { G, Path, Rect, Svg } from '@hozo/svg'
import type { BrushModel } from './brush.ts'

export function BrushSvg({ model, color, ink }: { model: BrushModel; color: string; ink: string }) {
  const { width, height, x0, x1 } = model
  const grip = Math.min(height - 8, 20)
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} fill={ink} fillOpacity={0.04} rx={4} />
      <Rect
        x={x0}
        y={0.5}
        width={Math.max(0, x1 - x0)}
        height={height - 1}
        fill={ink}
        fillOpacity={0.08}
        stroke={ink}
        strokeOpacity={0.4}
        rx={4}
      />
      {model.overview ? (
        <Path
          d={model.overview}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ) : null}
      <G>
        {[x0, x1].map((x, i) => (
          <Rect
            // biome-ignore lint/suspicious/noArrayIndexKey: the two ends, always in this order
            key={i}
            // Kept whole at the strip's edges, where half a grip would be cut off.
            x={Math.min(width - 6, Math.max(0, x - 3))}
            y={(height - grip) / 2}
            width={6}
            height={grip}
            rx={3}
            fill={ink}
          />
        ))}
      </G>
    </Svg>
  )
}
