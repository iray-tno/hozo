import {
  HozoInheritedMetricsContext,
  HozoInheritedPaintContext,
  type HozoInheritedTextFrame,
  useHozoInheritedTextFrame,
} from '@hozo/engine/generated/text-inheritance-protocol'
import { type ComponentPropsWithRef, type ElementType, type ReactNode, useContext } from 'react'
import { Animated, StyleSheet, Text, type TextProps } from 'react-native'
import { HozoInheritedTextScope } from './inherited-text-scope.tsx'
import {
  flattenInheritedTextStyle,
  type InheritedNativeStyle,
} from './inherited-text-style.native.ts'

const AnimatedText: ElementType = Animated.createAnimatedComponent(Text)

type TextHostProps = ComponentPropsWithRef<typeof Text>

// A plain call, not a component: the readers below must not add a render
// execution per Text that the existing count comparisons would see.
function inheritedHost(
  frame: HozoInheritedTextFrame,
  { style, children, ...props }: TextHostProps,
) {
  // Local overrides mask the shared value but retain this host kind. Toggling
  // an own colour must not remount nested state or allocate another timeline.
  const Component = frame.paint.motion ? AnimatedText : Text
  const paint = frame.paint.motion
    ? { color: frame.paint.motion.color ?? frame.paint.color }
    : frame.paint
  return (
    <Component
      {...props}
      style={[style, frame.metrics as TextProps['style'], paint as TextProps['style']]}
    >
      {children}
    </Component>
  )
}

/** @internal Generated ABI; ordinary output does not import it. */
export function HozoInheritedText(props: TextHostProps) {
  const frame = useHozoInheritedTextFrame(flattenInheritedTextStyle(props.style))
  return (
    <HozoInheritedTextScope frame={frame}>{inheritedHost(frame, props)}</HozoInheritedTextScope>
  )
}

/**
 * @internal Generated ABI (decision 013). An outermost Text whose children
 * the compiler can see: strings and nested Text, which React Native itself
 * inherits from this host. Nothing below reads a frame, so none is published.
 *
 * Unlike HozoInheritedText it never merges or validates its own style: the
 * inherited values go first and the element's own style last, so whatever the
 * element sets -- an Animated value, a platform colour, a font family the
 * protocol does not carry -- wins as written. This is the default route, and
 * a value the protocol cannot read must not throw in an application.
 */
export function HozoInheritedLeafText({
  style,
  children,
  hozoOpaque,
  ...props
}: TextHostProps & { hozoOpaque?: boolean }) {
  const metrics = useContext(HozoInheritedMetricsContext)
  const paint = useContext(HozoInheritedPaintContext)
  // An inherited colour transition animates only where nothing local masks it.
  const motion =
    paint.motion && (StyleSheet.flatten(style) as { color?: unknown } | undefined)?.color == null
  const Component = motion ? AnimatedText : Text
  // Masked motion: the element's own colour, last in the array, wins anyway.
  const inherited = motion
    ? { color: paint.motion?.color ?? paint.color }
    : paint.motion
      ? undefined
      : paint
  return (
    <Component
      {...props}
      style={[metrics as TextProps['style'], inherited as TextProps['style'], style]}
    >
      {hozoOpaque ? (
        // A Text rendered by a child the compiler could not see inherits from
        // this host natively. It must not also apply the frame from outside,
        // which would put the outer value back over this host's own.
        <HozoInheritedMetricsContext.Provider value={EMPTY}>
          <HozoInheritedPaintContext.Provider value={EMPTY}>
            {children}
          </HozoInheritedPaintContext.Provider>
        </HozoInheritedMetricsContext.Provider>
      ) : (
        children
      )}
    </Component>
  )
}

const EMPTY = Object.freeze({})

/**
 * @internal Generated ABI (decision 013). Publishes a text-styled container's
 * declarations, merged over the inherited frame, to children the compiler
 * cannot see. Renders no host: the container keeps its own View.
 */
export function HozoInheritedScope({
  style,
  children,
}: {
  style?: InheritedNativeStyle
  children?: ReactNode
}) {
  const frame = useHozoInheritedTextFrame(flattenInheritedTextStyle(style))
  return <HozoInheritedTextScope frame={frame}>{children}</HozoInheritedTextScope>
}
