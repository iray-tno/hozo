import {
  type HozoInheritedTextFrame,
  useHozoInheritedTextFrame,
} from '@hozo/engine/generated/text-inheritance-protocol'
import type { ComponentPropsWithRef, ElementType } from 'react'
import { Animated, Text, type TextProps } from 'react-native'
import { HozoInheritedTextScope } from './inherited-text-scope.tsx'
import { flattenInheritedTextStyle } from './inherited-text-style.native.ts'

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
