import { hozoSplitTextStyle } from '@hozo/engine'
import { Children, createElement, type ReactNode } from 'react'
import { type StyleProp, StyleSheet, Text, type TextStyle, type ViewStyle } from 'react-native'

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

/**
 * A panel's content, with each text child inside a `Text` carrying the
 * panel's text style.
 *
 * A string handed to a pattern as `content` lands in a `View` the compiler
 * never saw, so nothing wrapped it, and React Native draws nothing for it:
 * the Accordion opened an empty panel and Tabs showed none (#1205). Per
 * child, as `hozoTextChildren` does, so an element beside the text is left
 * alone.
 */
export function textChildren(children: ReactNode, style: StyleProp<TextStyle>): ReactNode {
  return Children.map(children, (child) =>
    typeof child === 'string' || typeof child === 'number'
      ? createElement(Text, { style }, child)
      : child,
  )
}
