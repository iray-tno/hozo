import React, { type ReactNode, useEffect } from 'react'
import { BackHandler, type StyleProp, View, type ViewStyle } from 'react-native'

export interface DismissableLayerProps {
  children?: ReactNode
  onDismiss?: () => void
  onEscapeKeyDown?: () => void
  onPointerDownOutside?: () => void
  disableOutsidePointerEvents?: boolean
  style?: StyleProp<ViewStyle>
}

type NativeLayerInstance = {
  onDismiss?: () => void
  onEscapeKeyDown?: () => void
}

const nativeLayers: NativeLayerInstance[] = []

/**
 * Universal `<DismissableLayer>` component for React Native.
 * Listens to BackHandler on Android and manages layered dismiss stack.
 */
export function DismissableLayer({
  children,
  onDismiss,
  onEscapeKeyDown,
  style,
  ...props
}: DismissableLayerProps) {
  useEffect(() => {
    const instance: NativeLayerInstance = {
      onDismiss,
      onEscapeKeyDown,
    }
    nativeLayers.push(instance)

    // `BackHandler` imported rather than read off `globalThis`, where React Native
    // has never put it. The lookup always returned `undefined` and the
    // `if` around it always failed, so this did nothing at all -- silently,
    // which is the worst way for an accessibility affordance to be absent.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const top = nativeLayers[nativeLayers.length - 1]
      if (top === instance) {
        instance.onEscapeKeyDown?.()
        instance.onDismiss?.()
        return true // Handled
      }
      return false
    })

    return () => {
      const idx = nativeLayers.indexOf(instance)
      if (idx !== -1) {
        nativeLayers.splice(idx, 1)
      }
      subscription.remove()
    }
  }, [onDismiss, onEscapeKeyDown])

  return React.createElement(View, { style, ...props }, children)
}
