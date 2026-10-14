import { useCallback, useMemo, useRef, useState } from 'react'

export interface HozoPressableInteractionState {
  pressed: boolean
  hovered: boolean
  focused: boolean
  focusVisible: boolean
}

const HOVERED = 1
const FOCUSED = 2
const PRESSED = 4
const FOCUS_VISIBLE = 8
const read = (mask: number): HozoPressableInteractionState => ({
  pressed: (mask & PRESSED) !== 0,
  hovered: (mask & HOVERED) !== 0,
  focused: (mask & FOCUSED) !== 0,
  focusVisible: (mask & FOCUS_VISIBLE) !== 0,
})

/**
 * The Native pressable's event-driven facts, shared with patterns (#897).
 * No subscriptions, animation nodes or global modality listeners. Hosts own
 * event delivery and compose their caller's handlers after these callbacks.
 * onChange runs synchronously for the existing native animation driver;
 * React state drives the ordinary style/children callbacks.
 */
export function usePressableInteraction({
  focusVisible = false,
  onChange,
}: {
  /** Text fields indicate focus even after a pointer brings up their keyboard. */
  focusVisible?: boolean | 'keyboard-input'
  onChange?: (state: HozoPressableInteractionState) => void
} = {}) {
  const [mask, setMask] = useState(0)
  const live = useRef(0)
  // Matches the primitive's existing policy: initial focus is keyboard-like;
  // a pointer/press clears it, and a key makes a currently focused host visible.
  const modality = useRef<'keyboard' | 'pointer'>('keyboard')
  const set = useCallback(
    (flag: number, active: boolean) => {
      const next = active ? live.current | flag : live.current & ~flag
      live.current = next
      onChange?.(read(next))
      setMask(next)
    },
    [onChange],
  )
  const handlers = useMemo(
    () => ({
      hoverIn: () => set(HOVERED, true),
      hoverOut: () => set(HOVERED, false),
      focus: () => {
        set(FOCUSED, true)
        if (focusVisible)
          set(FOCUS_VISIBLE, focusVisible === 'keyboard-input' || modality.current === 'keyboard')
      },
      blur: () => {
        set(FOCUSED, false)
        if (focusVisible) set(FOCUS_VISIBLE, false)
      },
      pointerDown: () => {
        modality.current = 'pointer'
        if (focusVisible === true) set(FOCUS_VISIBLE, false)
      },
      keyDown: () => {
        modality.current = 'keyboard'
        if (focusVisible && (live.current & FOCUSED) !== 0) set(FOCUS_VISIBLE, true)
      },
      pressIn: () => {
        modality.current = 'pointer'
        if (focusVisible === true) set(FOCUS_VISIBLE, false)
        set(PRESSED, true)
      },
      pressOut: () => set(PRESSED, false),
    }),
    [focusVisible, set],
  )
  return { state: useMemo(() => read(mask), [mask]), handlers }
}
