import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  type ComputePositionOptions,
  computePosition,
  type PositionResult,
} from './floating-geometry.ts'

export interface UseFloatingPositionOptions extends ComputePositionOptions {
  anchorRef: RefObject<HTMLElement | null>
  floatingRef: RefObject<HTMLElement | null>
  enabled?: boolean
}

/**
 * Universal React hook for floating element positioning on Web.
 * Automatically recalculates position on scroll, resize, and element dimension changes.
 */
export function useFloatingPosition({
  anchorRef,
  floatingRef,
  enabled = true,
  placement = 'bottom',
  offset = 8,
  crossAxisOffset = 0,
  flip = true,
  shift = true,
  viewportPadding = 8,
  arrowPadding = 4,
}: UseFloatingPositionOptions): PositionResult | null {
  const [position, setPosition] = useState<PositionResult | null>(null)

  const update = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return
    const anchor = anchorRef.current
    const floating = floatingRef.current
    if (!anchor || !floating) return

    const anchorDomRect = anchor.getBoundingClientRect()
    const floatingDomRect = floating.getBoundingClientRect()

    const anchorRect = {
      x: anchorDomRect.left,
      y: anchorDomRect.top,
      width: anchorDomRect.width,
      height: anchorDomRect.height,
    }
    const floatingRect = {
      x: floatingDomRect.left,
      y: floatingDomRect.top,
      width: floatingDomRect.width,
      height: floatingDomRect.height,
    }
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    }

    const result = computePosition(anchorRect, floatingRect, viewport, {
      placement,
      offset,
      crossAxisOffset,
      flip,
      shift,
      viewportPadding,
      arrowPadding,
    })

    setPosition(result)
  }, [
    enabled,
    anchorRef,
    floatingRef,
    placement,
    offset,
    crossAxisOffset,
    flip,
    shift,
    viewportPadding,
    arrowPadding,
  ])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    update()

    const handleScrollOrResize = () => update()
    window.addEventListener('resize', handleScrollOrResize)
    window.addEventListener('scroll', handleScrollOrResize, true)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => update())
      if (anchorRef.current) resizeObserver.observe(anchorRef.current)
      if (floatingRef.current) resizeObserver.observe(floatingRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleScrollOrResize)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      resizeObserver?.disconnect()
    }
  }, [enabled, update, anchorRef, floatingRef])

  return position
}

export interface FloatingPositionerProps extends ComputePositionOptions {
  children?: ReactNode | ((position: PositionResult | null) => ReactNode)
  anchorRef: RefObject<HTMLElement | null>
  className?: string
  style?: CSSProperties
}

/**
 * Universal `<FloatingPositioner>` component for Web.
 * Popper/Floating-UI equivalent positioning container that attaches to an anchor element.
 */
export function FloatingPositioner({
  children,
  anchorRef,
  className,
  style,
  ...options
}: FloatingPositionerProps) {
  const floatingRef = useRef<HTMLDivElement>(null)
  const position = useFloatingPosition({
    anchorRef,
    floatingRef,
    ...options,
  })

  const positionStyles: CSSProperties = position
    ? {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        willChange: 'transform',
      }
    : {
        position: 'fixed',
        left: '-9999px',
        top: '-9999px',
        visibility: 'hidden',
      }

  return (
    <div
      ref={floatingRef}
      className={className}
      style={{ ...positionStyles, ...style }}
      data-placement={position?.placement}
      data-flipped={position?.flipped ? '' : undefined}
      data-shifted={position?.shifted ? '' : undefined}
    >
      {typeof children === 'function' ? children(position) : children}
    </div>
  )
}
