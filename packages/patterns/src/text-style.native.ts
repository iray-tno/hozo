import { type StyleProp, StyleSheet, type TextStyle, type ViewStyle } from 'react-native'

/**
 * The properties a `View` cannot draw and a `Text` can.
 *
 * On the Web a component's colour is inherited by its text; here a style on
 * a `View` or `Pressable` stays there, so `text-white` on a chip or an avatar
 * would colour nothing. A pattern whose text is its own element moves these
 * onto it -- the move the compiler makes for a `View`'s children, done by
 * the component because the compiler never sees the `Text` it draws.
 */
const TEXT_KEYS = new Set([
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textDecorationColor',
  'textDecorationLine',
  'textDecorationStyle',
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius',
  'textTransform',
])

/** `style`, split into what its box draws and what its text does. */
export function splitTextStyle(style: StyleProp<ViewStyle | TextStyle>): [ViewStyle, TextStyle] {
  const box: Record<string, unknown> = {}
  const text: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(StyleSheet.flatten(style) ?? {})) {
    ;(TEXT_KEYS.has(key) ? text : box)[key] = value
  }
  return [box as ViewStyle, text as TextStyle]
}
