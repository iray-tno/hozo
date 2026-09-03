import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
} from 'react'

export interface DismissableLayerProps {
  children?: ReactNode
  onDismiss?: () => void
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onPointerDownOutside?: (event: PointerEvent) => void
  disableOutsidePointerEvents?: boolean
  className?: string
  style?: CSSProperties
}

type LayerInstance = {
  node: HTMLElement | null
  onDismiss?: () => void
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onPointerDownOutside?: (event: PointerEvent) => void
}

// Global stack of active dismissable layers (LIFO: last opened is top-most)
const layers: LayerInstance[] = []

/**
 * Universal `<DismissableLayer>` component for Web.
 * Detects Escape key presses and pointer down outside the layer boundary.
 * Manages layer stacking order so only the top-most active layer dismisses.
 */
export function DismissableLayer({
  children,
  onDismiss,
  onEscapeKeyDown,
  onPointerDownOutside,
  disableOutsidePointerEvents = false,
  className,
  style,
}: DismissableLayerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    const instance: LayerInstance = {
      node,
      onDismiss,
      onEscapeKeyDown,
      onPointerDownOutside,
    }

    layers.push(instance)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Only the top-most layer reacts to Escape
      const topLayer = layers[layers.length - 1]
      if (topLayer !== instance) return

      instance.onEscapeKeyDown?.(event)
      if (!event.defaultPrevented) {
        instance.onDismiss?.()
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const topLayer = layers[layers.length - 1]
      if (topLayer !== instance) return
      if (!instance.node) return

      const target = event.target as Node | null
      const isOutside = target && !instance.node.contains(target)

      if (isOutside) {
        instance.onPointerDownOutside?.(event)
        if (!event.defaultPrevented) {
          instance.onDismiss?.()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      const index = layers.indexOf(instance)
      if (index !== -1) {
        layers.splice(index, 1)
      }
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [onDismiss, onEscapeKeyDown, onPointerDownOutside])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        pointerEvents: 'auto',
      }}
    >
      {children}
    </div>
  )
}
