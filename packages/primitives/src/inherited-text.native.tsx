import { useHozoInheritedTextFrame } from '@hozo/engine/generated/text-inheritance-protocol'
import type { ComponentPropsWithRef, ElementType } from 'react'
import { Animated, Text, type TextProps } from 'react-native'
import { HozoInheritedTextScope } from './inherited-text-scope.tsx'
import { flattenInheritedTextStyle } from './inherited-text-style.native.ts'

const AnimatedText: ElementType = Animated.createAnimatedComponent(Text)

/** @internal Generated ABI; ordinary output does not import it. */
export function HozoInheritedText({
  style,
  children,
  ...props
}: ComponentPropsWithRef<typeof Text>) {
  const frame = useHozoInheritedTextFrame(flattenInheritedTextStyle(style))
  // Local overrides mask the shared value but retain this host kind. Toggling
  // an own colour must not remount nested state or allocate another timeline.
  const Component = frame.paint.motion ? AnimatedText : Text
  const paint = frame.paint.motion
    ? { color: frame.paint.motion.color ?? frame.paint.color }
    : frame.paint
  return (
    <HozoInheritedTextScope frame={frame}>
      <Component
        {...props}
        style={[style, frame.metrics as TextProps['style'], paint as TextProps['style']]}
      >
        {children}
      </Component>
    </HozoInheritedTextScope>
  )
}
