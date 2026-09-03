import React, { type ReactNode } from 'react'

export type LiveRegionMode = 'polite' | 'assertive'

export interface LiveRegionProps {
  children?: ReactNode
  mode?: LiveRegionMode
  style?: Record<string, unknown> | unknown[]
}

/**
 * Universal `<LiveRegion>` component for React Native.
 * Renders an off-screen/accessible container that instructs TalkBack/VoiceOver to announce updates.
 */
export function LiveRegion({ children, mode = 'polite', style, ...props }: LiveRegionProps) {
  return React.createElement(
    'View',
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
      ? React.createElement('Text', { accessibilityLiveRegion: mode }, children)
      : children,
  )
}

/**
 * Imperative announcement hook for React Native.
 * Calls `AccessibilityInfo.announceForAccessibility` directly.
 */
export function useAnnounce() {
  return (message: string, _mode: LiveRegionMode = 'polite') => {
    const globalRN = (globalThis as Record<string, unknown>).AccessibilityInfo as
      | { announceForAccessibility?: (msg: string) => void }
      | undefined
    if (globalRN?.announceForAccessibility) {
      globalRN.announceForAccessibility(message)
    }
  }
}
