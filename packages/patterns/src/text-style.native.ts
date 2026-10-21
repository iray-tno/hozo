import { hozoSplitTextStyle } from '@hozo/engine'
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
/** `style`, split into what its box draws and what its text does. */
export function splitTextStyle(style: StyleProp<ViewStyle | TextStyle>): [ViewStyle, TextStyle] {
  const [box, text] = hozoSplitTextStyle(StyleSheet.flatten(style) ?? {})
  return [box as ViewStyle, text as TextStyle]
}
