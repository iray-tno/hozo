import type { ReactNode } from 'react'
import {
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native'

/** Only these child-layout properties belong to the scroll content, not its viewport. */
const contentKeys = new Set([
  'flexDirection',
  'flexWrap',
  'alignItems',
  'justifyContent',
  'alignContent',
  'gap',
  'rowGap',
  'columnGap',
  'padding',
  'paddingHorizontal',
  'paddingVertical',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingStart',
  'paddingEnd',
])

interface Props extends ViewProps {
  enabled?: boolean
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}

/**
 * A real vertical scroll owner, selected only by compiler-adapted overflow.
 * Bounds/border/background stay on the viewport; gap, alignment and padding
 * lay out its content. Passing all of them as ScrollView.style is not equivalent.
 */
export function PatternScrollContainer({ enabled, style, ...props }: Props) {
  if (!enabled) return <View {...props} style={style} />
  const viewport: Record<string, unknown> = { flexGrow: 0, flexShrink: 1 }
  const content: Record<string, unknown> = {}
  const flat = StyleSheet.flatten(style) ?? {}
  for (const [key, value] of Object.entries(flat)) {
    const target = contentKeys.has(key) ? content : viewport
    target[key] = value
  }
  return (
    <ScrollView
      {...props}
      horizontal={false}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={flat.overflow !== 'hidden'}
      style={viewport}
      contentContainerStyle={content}
    />
  )
}
