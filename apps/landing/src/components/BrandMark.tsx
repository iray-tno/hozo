import { Text, View } from '@hozo/core'
import { Svg } from '@hozo/svg'
import { MARK_FACES, MARK_FRAME, MARK_PLACE, MARK_TILE } from './brand-mark-faces.ts'

// The mark and the name, as the landing's header and the /docs header both
// show them. Inside a link that carries `group`, the tile lifts on hover.
// The mark is the favicon's four-way dovetail (scripts/brand-mark.mjs draws
// both); it keeps its own sumi tile in /docs' light theme too, as the favicon
// does in a light tab. The name beside it says what it is, so it is unnamed.
export function BrandMark() {
  return (
    <View className="flex flex-row items-center gap-2">
      <Svg
        viewBox="0 0 32 32"
        className="w-7 h-7 sm:w-8 sm:h-8 rounded-[22%] shadow-md group-hover:scale-105 transition-transform"
      >
        <Svg.Rect width="32" height="32" rx="7" fill={MARK_TILE} />
        <Svg.Rect
          x="5"
          y="5"
          width="22"
          height="22"
          fill="none"
          stroke={MARK_FRAME}
          strokeWidth="1.5"
        />
        <Svg.G
          transform={`translate(${MARK_PLACE.x} ${MARK_PLACE.y}) scale(${MARK_PLACE.size / 32})`}
        >
          {/* A hairline of each face's own colour closes the seams between neighbours; bare fills trim its spill. */}
          {MARK_FACES.map((face) => (
            <Svg.Path
              key={`s${face.d}`}
              d={face.d}
              fill={face.fill}
              stroke={face.fill}
              strokeWidth="0.12"
              strokeLinejoin="round"
            />
          ))}
          {MARK_FACES.map((face) => (
            <Svg.Path key={face.d} d={face.d} fill={face.fill} />
          ))}
        </Svg.G>
      </Svg>
      <Text className="font-extrabold text-lg sm:text-xl tracking-tight text-shikkui">Hozo</Text>
    </View>
  )
}
