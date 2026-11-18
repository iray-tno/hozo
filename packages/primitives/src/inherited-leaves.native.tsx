// Decision 013's two runtime pieces, in a module of their own. Nearly every
// Native file emits the reader, and an app of any size has a scope somewhere,
// so they ship together. Not with RFC 006's whole-route reader or its style
// validation in `inherited-text`: Metro does not tree-shake, and the default
// route needs neither.
import {
  HozoInheritedMetricsContext,
  HozoInheritedPaintContext,
  type HozoInheritedTextOwn,
  useHozoInheritedTextFrame,
} from '@hozo/engine/generated/text-inheritance-protocol'
import { type ComponentPropsWithRef, type ElementType, type ReactNode, useContext } from 'react'
import {
  Animated,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
} from 'react-native'
import { HozoInheritedTextScope } from './inherited-text-scope.tsx'

const AnimatedText: ElementType = Animated.createAnimatedComponent(Text)

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
}: ComponentPropsWithRef<typeof Text> & { hozoOpaque?: boolean }) {
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
  // Nothing published above: the host gets exactly the style a plain Text
  // would, so a tree with no text-styled container renders as it did.
  const bare = !paint.motion && isEmpty(metrics) && isEmpty(paint)
  return (
    <Component
      {...props}
      style={bare ? style : [metrics as TextProps['style'], inherited as TextProps['style'], style]}
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
// A pressable hands its text styles to a direct label (#876). The reader is
// the compiled form of the `Text` that label is, so it must stay one.
;(HozoInheritedLeafText as { hozoLabelText?: boolean }).hozoLabelText = true

const EMPTY = Object.freeze({})

function isEmpty(record: object): boolean {
  for (const _ in record) return false
  return true
}

/**
 * @internal Generated ABI (decision 013). Publishes a text-styled container's
 * declarations, merged over the inherited frame, to children the compiler
 * cannot see. Renders no host: the container keeps its own View.
 *
 * Its style is the compiler's, built only from the seven fields' plain values,
 * so it is read as is rather than validated like an author's.
 */
export function HozoInheritedScope({
  style,
  children,
}: {
  style?: StyleProp<TextStyle>
  children?: ReactNode
}) {
  const own = (StyleSheet.flatten(style) ?? EMPTY) as HozoInheritedTextOwn
  const frame = useHozoInheritedTextFrame(own)
  return <HozoInheritedTextScope frame={frame}>{children}</HozoInheritedTextScope>
}
