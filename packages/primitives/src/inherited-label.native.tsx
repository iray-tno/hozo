import { useHozoInheritedTextFrame } from '@hozo/engine/generated/text-inheritance-protocol'
import { Children, type ReactNode } from 'react'
import type { StyleProp, TextStyle } from 'react-native'
import { HozoInheritedText } from './inherited-text.native.tsx'
import { HozoInheritedTextScope } from './inherited-text-scope.tsx'
import { flattenInheritedTextStyle } from './inherited-text-style.native.ts'

/** A pattern supplies already-resolved label styles, not classes or state. */
export function HozoInheritedLabel({
  style,
  children,
}: {
  style?: StyleProp<TextStyle>
  children?: ReactNode
}) {
  const frame = useHozoInheritedTextFrame(flattenInheritedTextStyle(style))
  return (
    <HozoInheritedTextScope frame={frame}>
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? (
          <HozoInheritedText style={style}>{child}</HozoInheritedText>
        ) : (
          child
        ),
      )}
    </HozoInheritedTextScope>
  )
}
