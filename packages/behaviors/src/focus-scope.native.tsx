import React, { type ReactNode } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'

export interface FocusCandidate {
  autofocus?: boolean
  focusable?: boolean
}

export function initialFocusIndex(candidates: readonly FocusCandidate[]): number | null {
  const requested = candidates.findIndex((c) => c.autofocus && c.focusable)
  if (requested !== -1) return requested
  const first = candidates.findIndex((c) => c.focusable)
  return first === -1 ? null : first
}

export function shouldRestoreFocus(opener: FocusCandidate | null | undefined): boolean {
  return opener?.focusable === true
}

export interface FocusScopeProps {
  children?: ReactNode
  trapped?: boolean
  autoFocus?: boolean
  restoreFocus?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * Universal `<FocusScope>` component for React Native.
 * Renders an accessible trapping container for modal dialogs and overlays.
 */
export function FocusScope({ children, trapped = true, style, ...props }: FocusScopeProps) {
  return React.createElement(
    View,
    {
      accessible: true,
      accessibilityViewIsModal: trapped,
      style,
      ...props,
    },
    children,
  )
}
