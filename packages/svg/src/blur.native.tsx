import {
  type ComponentProps,
  cloneElement,
  createContext,
  forwardRef,
  useContext,
  useMemo,
  useState,
} from 'react'
import { type LayoutChangeEvent, PixelRatio, StyleSheet } from 'react-native'
import * as NativeSvg from 'react-native-svg'
import { androidBlurDeviation, type RasterScale, svgRasterScale } from './blur-raster.ts'

const RasterContext = createContext<RasterScale | undefined>(undefined)

/** Public refs still refer to the upstream instance, not a wrapper host. */
export const AndroidSvg = forwardRef<NativeSvg.Svg, NativeSvg.SvgProps>((props, ref) => {
  const [layout, setLayout] = useState<{ width: number; height: number }>()
  const style = StyleSheet.flatten(props.style)
  const fixedWidth = numericSize(props.width ?? style?.width)
  const fixedHeight = numericSize(props.height ?? style?.height)
  const width = fixedWidth ?? layout?.width
  const height = fixedHeight ?? layout?.height
  const density = PixelRatio.get()
  const scale = useMemo(
    () => svgRasterScale(width, height, props.viewBox, props.preserveAspectRatio, density),
    [width, height, props.viewBox, props.preserveAspectRatio, density],
  )
  // Upstream attaches authored onLayout to its internal G, whose bounds may
  // only cover drawn content. Observe the actual SVG viewport on the native
  // root instead; do not replace or duplicate the author's G callback.
  // Inheriting render preserves the root ref and all upstream imperative APIs.
  return (
    <RasterContext.Provider value={scale}>
      <MeasuredSvg
        {...props}
        ref={ref}
        onViewportLayout={
          fixedWidth !== undefined && fixedHeight !== undefined
            ? undefined
            : (event) => {
                const { width, height } = event.nativeEvent.layout
                setLayout((previous) =>
                  previous?.width === width && previous.height === height
                    ? previous
                    : { width, height },
                )
              }
        }
      />
    </RasterContext.Provider>
  )
})
AndroidSvg.displayName = 'HozoAndroidSvg'

function numericSize(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() && !value.includes('%')) {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return undefined
}

class MeasuredSvg extends NativeSvg.Svg {
  declare props: NativeSvg.SvgProps & { onViewportLayout?: (event: LayoutChangeEvent) => void }

  render() {
    // Do not forward the private observation prop into native attributes.
    const { onViewportLayout } = this.props
    const element = super.render()
    return cloneElement(element, { onViewportLayout: undefined, onLayout: onViewportLayout })
  }
}

export const AndroidGaussianBlur = forwardRef<
  NativeSvg.FeGaussianBlur,
  ComponentProps<typeof NativeSvg.FeGaussianBlur>
>((props, ref) => {
  const scale = useContext(RasterContext) ?? { x: PixelRatio.get(), y: PixelRatio.get() }
  return (
    <NativeSvg.FeGaussianBlur
      {...props}
      ref={ref}
      stdDeviation={androidBlurDeviation(props.stdDeviation, scale)}
    />
  )
})
AndroidGaussianBlur.displayName = 'HozoAndroidGaussianBlur'

// Upstream builds its shadow with its own FeGaussianBlur, not Hozo's named
// export. Convert here too, once, rather than silently leaving shadows weak.
export const AndroidDropShadow = forwardRef<
  NativeSvg.FeDropShadow,
  ComponentProps<typeof NativeSvg.FeDropShadow>
>((props, ref) => {
  const scale = useContext(RasterContext) ?? { x: PixelRatio.get(), y: PixelRatio.get() }
  return (
    <NativeSvg.FeDropShadow
      {...props}
      ref={ref}
      stdDeviation={androidBlurDeviation(props.stdDeviation, scale)}
    />
  )
})
AndroidDropShadow.displayName = 'HozoAndroidDropShadow'
