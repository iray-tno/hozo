import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { BasePlacement } from './floating-geometry.ts'
import {
  computeSafePolygon,
  DelayGroupMachine,
  isPointInPolygon,
  type Polygon,
} from './hover-geometry.ts'

// Context for Delay Grouping across multiple tooltips
const TooltipGroupContext = createContext<DelayGroupMachine | null>(null)

export interface TooltipGroupProviderProps {
  children: ReactNode
  openDelay?: number
  closeDelay?: number
  skipDelayDuration?: number
}

/**
 * Provides shared delay grouping (warmup state) for child tooltips.
 * When one tooltip opens, neighboring tooltips open immediately without delay.
 */
export function TooltipGroupProvider({
  children,
  openDelay = 700,
  closeDelay = 300,
  skipDelayDuration = 300,
}: TooltipGroupProviderProps) {
  const machine = useMemo(
    () => new DelayGroupMachine({ openDelay, closeDelay, skipDelayDuration }),
    [openDelay, closeDelay, skipDelayDuration],
  )

  useEffect(() => {
    return () => machine.dispose()
  }, [machine])

  return <TooltipGroupContext.Provider value={machine}>{children}</TooltipGroupContext.Provider>
}

export function useTooltipGroup(): DelayGroupMachine | null {
  return useContext(TooltipGroupContext)
}

export interface UseHoverTriggerOptions {
  /** Controlled open state */
  open?: boolean
  /** Initial open state when uncontrolled */
  defaultOpen?: boolean
  /** Callback fired when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Delay in milliseconds before opening. Defaults to 700ms or group value. */
  openDelay?: number
  /** Delay in milliseconds before closing. Defaults to 300ms or group value. */
  closeDelay?: number
  /** Whether the trigger is disabled */
  disabled?: boolean
  /** If true, moving the pointer into the floating content keeps it open */
  hoverableContent?: boolean
  /** If true, keyboard focus opens the tooltip immediately */
  openOnFocus?: boolean
  /** Reference to anchor DOM element for safe-polygon calculation */
  anchorRef?: RefObject<HTMLElement | null>
  /** Reference to floating DOM element for safe-polygon calculation */
  floatingRef?: RefObject<HTMLElement | null>
  /** Current base placement of floating content for safe-polygon */
  placement?: BasePlacement
  /** Id of the tooltip content for aria-describedby */
  contentId?: string
}

export interface TriggerProps {
  onPointerEnter: (event: React.PointerEvent) => void
  onPointerLeave: (event: React.PointerEvent) => void
  onFocus: (event: React.FocusEvent) => void
  onBlur: (event: React.FocusEvent) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  'aria-describedby'?: string
}

export interface ContentProps {
  onPointerEnter: (event: React.PointerEvent) => void
  onPointerLeave: (event: React.PointerEvent) => void
}

export interface UseHoverTriggerReturn {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  triggerProps: TriggerProps
  contentProps: ContentProps
}

/**
 * Universal hook for managing hover, focus, and delay grouping on Web.
 */
export function useHoverTrigger({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  openDelay: customOpenDelay,
  closeDelay: customCloseDelay,
  disabled = false,
  hoverableContent = true,
  openOnFocus = true,
  anchorRef,
  floatingRef,
  placement = 'bottom',
  contentId,
}: UseHoverTriggerOptions = {}): UseHoverTriggerReturn {
  const generatedId = useId()
  const id = contentId ?? generatedId

  const group = useTooltipGroup()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen

  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safePolygonRef = useRef<Polygon | null>(null)

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const changeOpen = useCallback(
    (nextOpen: boolean) => {
      if (disabled) return
      if (!isControlled) {
        setUncontrolledOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
      if (nextOpen) {
        group?.onOpen(id)
      } else {
        group?.onClose(id)
      }
    },
    [disabled, isControlled, onOpenChange, group, id],
  )

  // Safe polygon calculation when content opens
  useEffect(() => {
    if (!isOpen || !hoverableContent || !anchorRef?.current || !floatingRef?.current) {
      safePolygonRef.current = null
      return
    }

    const anchorRect = anchorRef.current.getBoundingClientRect()
    const floatingRect = floatingRef.current.getBoundingClientRect()
    safePolygonRef.current = computeSafePolygon(
      {
        x: anchorRect.left,
        y: anchorRect.top,
        width: anchorRect.width,
        height: anchorRect.height,
      },
      {
        x: floatingRect.left,
        y: floatingRect.top,
        width: floatingRect.width,
        height: floatingRect.height,
      },
      placement,
    )
  }, [isOpen, hoverableContent, anchorRef, floatingRef, placement])

  // Mouse move listener to detect if cursor is traversing safe polygon
  useEffect(() => {
    if (!isOpen || !safePolygonRef.current) return

    const handlePointerMove = (e: PointerEvent) => {
      if (!safePolygonRef.current) return
      const isInside = isPointInPolygon({ x: e.clientX, y: e.clientY }, safePolygonRef.current)
      if (isInside && closeTimerRef.current) {
        // Cursor is traveling inside safe polygon towards content: cancel closing!
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [isOpen])

  // Effective delay durations
  const effectiveOpenDelay = group?.getEffectiveOpenDelay() ?? customOpenDelay ?? 700
  const effectiveCloseDelay = group?.getCloseDelay() ?? customCloseDelay ?? 300

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || e.pointerType === 'touch') return
      clearTimers()

      if (effectiveOpenDelay === 0) {
        changeOpen(true)
      } else {
        openTimerRef.current = setTimeout(() => {
          changeOpen(true)
        }, effectiveOpenDelay)
      }
    },
    [disabled, clearTimers, effectiveOpenDelay, changeOpen],
  )

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || e.pointerType === 'touch') return
      clearTimers()

      closeTimerRef.current = setTimeout(() => {
        changeOpen(false)
      }, effectiveCloseDelay)
    },
    [disabled, clearTimers, effectiveCloseDelay, changeOpen],
  )

  const handleFocus = useCallback(() => {
    if (disabled || !openOnFocus) return
    clearTimers()
    changeOpen(true)
  }, [disabled, openOnFocus, clearTimers, changeOpen])

  const handleBlur = useCallback(() => {
    if (disabled) return
    clearTimers()
    changeOpen(false)
  }, [disabled, clearTimers, changeOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        clearTimers()
        changeOpen(false)
      }
    },
    [isOpen, clearTimers, changeOpen],
  )

  const handleContentPointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !hoverableContent || e.pointerType === 'touch') return
      // Clear close timer when pointer enters floating content
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    },
    [disabled, hoverableContent],
  )

  const handleContentPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !hoverableContent || e.pointerType === 'touch') return
      clearTimers()
      closeTimerRef.current = setTimeout(() => {
        changeOpen(false)
      }, effectiveCloseDelay)
    },
    [disabled, hoverableContent, clearTimers, effectiveCloseDelay, changeOpen],
  )

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  return {
    isOpen,
    setIsOpen: changeOpen,
    triggerProps: {
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handlePointerLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      'aria-describedby': isOpen ? id : undefined,
    },
    contentProps: {
      onPointerEnter: handleContentPointerEnter,
      onPointerLeave: handleContentPointerLeave,
    },
  }
}
