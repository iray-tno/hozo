import React, { type ReactNode } from 'react'
import { AccessibilityInfo, type StyleProp, Text, View, type ViewStyle } from 'react-native'

export type LiveRegionMode = 'polite' | 'assertive'

export interface LiveRegionProps {
  children?: ReactNode
  mode?: LiveRegionMode
  style?: StyleProp<ViewStyle>
}

/**
 * Universal `<LiveRegion>` component for React Native.
 * Renders an off-screen/accessible container that instructs TalkBack/VoiceOver to announce updates.
 */
export function LiveRegion({ children, mode = 'polite', style, ...props }: LiveRegionProps) {
  return React.createElement(
    View,
    {
      accessibilityLiveRegion: mode,
      style: [
        {
          position: 'absolute',
          opacity: 0,
          height: 1,
          width: 1,
          overflow: 'hidden',
        },
        style,
      ],
      ...props,
    },
    typeof children === 'string'
      ? React.createElement(Text, { accessibilityLiveRegion: mode }, children)
      : children,
  )
}

/**
 * Imperative announcement hook for React Native.
 * Calls `AccessibilityInfo.announceForAccessibility` directly.
 */
export function useAnnounce() {
  return (message: string, _mode: LiveRegionMode = 'polite') => {
    // `AccessibilityInfo` imported rather than read off `globalThis`, where React Native
    // has never put it. The lookup always returned `undefined` and the
    // `if` around it always failed, so this did nothing at all -- silently,
    // which is the worst way for an accessibility affordance to be absent.
    AccessibilityInfo.announceForAccessibility(message)
  }
}
