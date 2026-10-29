/**
 * An alert on React Native, where only Android has live regions (#983).
 *
 * - **Android** announces a change inside a view marked
 *   `accessibilityLiveRegion`, which takes the Web's `polite`/`assertive`
 *   words directly.
 * - **iOS** has no live region. The message is handed to
 *   `announceForAccessibility` when it appears and whenever it changes --
 *   only a string or a number, since nothing else can be spoken.
 *
 * The role is passed as well: React Native maps `role="alert"` for a reader
 * that asks what the view is, though on neither platform does the role alone
 * make anything speak.
 *
 * `className` is resolved here at runtime, and its text styles are moved onto
 * a string child's `Text`: a `View` draws no text, and React Native does not
 * inherit a View's colour.
 */

import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useEffect } from 'react'
import {
  AccessibilityInfo,
  Platform,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import { splitTextStyle } from './text-style.native.ts'

export type HozoAlertLive = 'polite' | 'assertive' | false

export interface HozoAlertProps {
  children?: ReactNode
  live?: HozoAlertLive
  className?: string
  /** After the class list, as every pattern's `*Style` prop is. */
  style?: StyleProp<ViewStyle>
}

export function HozoAlert({ children, live = false, className, style }: HozoAlertProps) {
  const [box, text] = splitTextStyle(hozoClasses(className))
  const spoken =
    typeof children === 'string' || typeof children === 'number' ? String(children) : undefined

  useEffect(() => {
    if (live && spoken && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(spoken)
  }, [live, spoken])

  return (
    <View
      role={live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined}
      accessibilityLiveRegion={live || undefined}
      style={[box, hozoAuthoredStyle(style)]}
    >
      {spoken === undefined ? children : <Text style={text}>{children}</Text>}
    </View>
  )
}

export { HozoAlert as Alert, type HozoAlertLive as AlertLive, type HozoAlertProps as AlertProps }
