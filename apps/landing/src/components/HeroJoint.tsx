import { Svg } from '@hozo/svg'
import { HERO_JOINT_FACES, HERO_JOINT_SIZE } from './hero-joint-faces.ts'

// The joint the project is named after, drawn very faintly behind the hero:
// a four-way dovetail (四方蟻) caught half-way along its diagonal slide. The
// drawing covers the whole hero, sliced to fill it, so the timbers run off its
// edges and only the joint itself is seen. It is decoration, so it has no
// name and takes no pointer.
export function HeroJoint() {
  return (
    <Svg
      viewBox={`0 0 ${HERO_JOINT_SIZE} ${HERO_JOINT_SIZE}`}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full opacity-[0.1] pointer-events-none -z-10"
    >
      {/* A hairline of each face's own colour closes the seam to its neighbour. */}
      {HERO_JOINT_FACES.map((face) => (
        <Svg.Path
          key={face.d}
          d={face.d}
          fill={face.fill}
          stroke={face.fill}
          strokeWidth="0.3"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  )
}
