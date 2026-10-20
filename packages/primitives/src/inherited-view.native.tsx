import {
  HOZO_INHERITED_TEXT_FIELDS,
  useHozoInheritedTextFrame,
} from '@hozo/engine/generated/text-inheritance-protocol'
import { Children, type ComponentPropsWithRef } from 'react'
import { View, type ViewProps } from 'react-native'
import { HozoInheritedText } from './inherited-text.native.tsx'
import { HozoInheritedTextScope } from './inherited-text-scope.tsx'
import {
  flattenInheritedTextStyle,
  type InheritedNativeStyle,
} from './inherited-text-style.native.ts'

export interface HozoInheritedViewProps extends Omit<ComponentPropsWithRef<typeof View>, 'style'> {
  style?: InheritedNativeStyle
}

/** @internal Publish owner data before removing invalid host View fields. */
export function HozoInheritedView({ style, children, ...props }: HozoInheritedViewProps) {
  const own = flattenInheritedTextStyle(style)
  const frame = useHozoInheritedTextFrame(own)
  const rendered = { ...own }
  for (const name of HOZO_INHERITED_TEXT_FIELDS) delete rendered[name]
  return (
    <HozoInheritedTextScope frame={frame}>
      <View {...props} style={rendered as ViewProps['style']}>
        {Children.map(children, (child) =>
          typeof child === 'string' || typeof child === 'number' ? (
            <HozoInheritedText>{child}</HozoInheritedText>
          ) : (
            child
          ),
        )}
      </View>
    </HozoInheritedTextScope>
  )
}
