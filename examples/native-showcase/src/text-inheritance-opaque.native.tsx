// Compiled separately from the label: no typography resolver or Context read.
import { type ComponentType, memo } from 'react'
import { type TextProps, type TextStyle, View } from 'react-native'

type Props = {
  name: string
  tick: number
  onTextLayout?: TextProps['onTextLayout']
  // Only the ordinary explicit RN control receives this; B/C omit the prop.
  frame?: TextStyle
}

export function createOpaqueTextBoundary(Label: ComponentType<Props>) {
  return memo(function OpaqueTextBoundary(props: Props) {
    return (
      <View collapsable={false} testID={`text-opaque-boundary-${props.name}`}>
        <Label {...props} />
      </View>
    )
  })
}
