import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DelayGroupMachine } from './hover-geometry.ts'

// Context for Delay Grouping across multiple tooltips on Native
const TooltipGroupContext = createContext<DelayGroupMachine | null>(null)

export interface TooltipGroupProviderProps {
  children: ReactNode
  openDelay?: number
  closeDelay?: number
  skipDelayDuration?: number
}

/**
 * Native implementation of TooltipGroupProvider.
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
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  openDelay?: number
  closeDelay?: number
  disabled?: boolean
  hoverableContent?: boolean
  openOnLongPress?: boolean
  contentId?: string
}

export interface NativeTriggerProps {
  onHoverIn: () => void
  onHoverOut: () => void
  onLongPress: () => void
  accessibilityHint?: string
}

export interface NativeContentProps {
  onHoverIn: () => void
  onHoverOut: () => void
}

export interface UseHoverTriggerReturn {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  triggerProps: NativeTriggerProps
  contentProps: NativeContentProps
}

/**
 * Universal hook for hover and long-press tooltips on React Native.
 */
export function useHoverTrigger({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  openDelay: customOpenDelay,
  closeDelay: customCloseDelay,
  disabled = false,
  openOnLongPress = true,
  contentId,
}: UseHoverTriggerOptions = {}): UseHoverTriggerReturn {
  const generatedId = useId()
  const id = contentId ?? generatedId

  const group = useTooltipGroup()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const requestedOpen = isControlled ? controlledOpen : uncontrolledOpen
  // `disabled` closes an open tooltip and keeps it closed (#2256). It is how
  // a caller keeps a hint off a popup its trigger has just opened, so
  // freezing the tooltip where it was would cover what it was disabled to
  // uncover. Read here so a controlled `open` obeys it too.
  const isOpen = !disabled && requestedOpen

  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      if (disabled && nextOpen) return
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

  // Tell the owner and the group that disabling closed it, and drop a
  // pending open, so enabling it again does not bring a stale tooltip back.
  useEffect(() => {
    if (!disabled) return
    clearTimers()
    if (requestedOpen) changeOpen(false)
  }, [disabled, requestedOpen, clearTimers, changeOpen])

  const effectiveOpenDelay = group?.getEffectiveOpenDelay() ?? customOpenDelay ?? 700
  const effectiveCloseDelay = group?.getCloseDelay() ?? customCloseDelay ?? 300

  const handleHoverIn = useCallback(() => {
    if (disabled) return
    clearTimers()

    if (effectiveOpenDelay === 0) {
      changeOpen(true)
    } else {
      openTimerRef.current = setTimeout(() => {
        changeOpen(true)
      }, effectiveOpenDelay)
    }
  }, [disabled, clearTimers, effectiveOpenDelay, changeOpen])

  const handleHoverOut = useCallback(() => {
    if (disabled) return
    clearTimers()

    closeTimerRef.current = setTimeout(() => {
      changeOpen(false)
    }, effectiveCloseDelay)
  }, [disabled, clearTimers, effectiveCloseDelay, changeOpen])

  const handleLongPress = useCallback(() => {
    if (disabled || !openOnLongPress) return
    clearTimers()
    changeOpen(true)
  }, [disabled, openOnLongPress, clearTimers, changeOpen])

  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  return {
    isOpen,
    setIsOpen: changeOpen,
    triggerProps: {
      onHoverIn: handleHoverIn,
      onHoverOut: handleHoverOut,
      onLongPress: handleLongPress,
    },
    contentProps: {
      onHoverIn: handleHoverIn,
      onHoverOut: handleHoverOut,
    },
  }
}
