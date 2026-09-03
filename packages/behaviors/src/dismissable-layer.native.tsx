import React, { type ReactNode, useEffect } from 'react'

export interface DismissableLayerProps {
  children?: ReactNode
  onDismiss?: () => void
  onEscapeKeyDown?: () => void
  onPointerDownOutside?: () => void
  disableOutsidePointerEvents?: boolean
  style?: Record<string, unknown> | unknown[]
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

    const globalBackHandler = (globalThis as Record<string, unknown>).BackHandler as
      | {
          addEventListener?: (event: string, handler: () => boolean) => { remove: () => void }
        }
      | undefined

    const subscription = globalBackHandler?.addEventListener?.('hardwareBackPress', () => {
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
      subscription?.remove?.()
    }
  }, [onDismiss, onEscapeKeyDown])

  return React.createElement('View', { style, ...props }, children)
}
