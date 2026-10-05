// Compiled by the Native host typecheck, with its own React and SVG peer types.
// Both namespace and generated-code imports must accept common filter props
// and upstream refs, even when Android is a forwardRef and iOS is a class.
import { type ComponentRef, createRef } from 'react'
import { FeDropShadow, FeGaussianBlur, Svg } from '../../../packages/svg/src/index.native.tsx'

export function SvgFilterTypeProbe() {
  const blur = createRef<ComponentRef<typeof FeGaussianBlur>>()
  const shadow = createRef<ComponentRef<typeof FeDropShadow>>()
  return (
    <Svg ref={(root) => root?.measure(() => {})} width={96} height={96} viewBox="0 0 96 96">
      <Svg.Defs>
        <Svg.Filter id="typed">
          <Svg.FeGaussianBlur
            ref={blur}
            stdDeviation="2 3"
            result="blurred"
            className="opacity-50"
          />
          <FeGaussianBlur ref={blur} in="SourceAlpha" stdDeviation={2} result="compiled" />
          <Svg.FeDropShadow ref={shadow} stdDeviation={2} result="shadow" className="opacity-50" />
          <FeDropShadow ref={shadow} dx={2} dy={3} result="compiled-shadow" />
        </Svg.Filter>
      </Svg.Defs>
    </Svg>
  )
}
