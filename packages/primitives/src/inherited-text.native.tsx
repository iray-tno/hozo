import { useHozoInheritedTextFrame } from '@hozo/engine/generated/text-inheritance-protocol'
import type { ComponentPropsWithRef } from 'react'
import { Text, type TextProps } from 'react-native'
import { HozoInheritedTextScope } from './inherited-text-scope.tsx'
import { flattenInheritedTextStyle } from './inherited-text-style.native.ts'

/** @internal Non-animated compiler ABI; ordinary output does not import it. */
export function HozoInheritedText({
  style,
  children,
  ...props
}: ComponentPropsWithRef<typeof Text>) {
  const frame = useHozoInheritedTextFrame(flattenInheritedTextStyle(style))
  return (
    <HozoInheritedTextScope frame={frame}>
      <Text
        {...props}
        style={[style, frame.metrics as TextProps['style'], frame.paint as TextProps['style']]}
      >
        {children}
      </Text>
    </HozoInheritedTextScope>
  )
}
