import { createContext, useCallback, useMemo, useRef, useState } from 'react'

export interface HozoPressableInteractionState {
  pressed: boolean
  hovered: boolean
  focused: boolean
  focusVisible: boolean
}

/**
 * The state a Native pressable shares with the Text inside it: a `HozoText`
 * anywhere below reads it to apply its `hover:` and `active:` looks (#876).
 * Here rather than in `@hozo/primitives` so `@hozo/patterns`' pressable
 * provides the same one, and a Text a caller nests in a pattern reads it too
 * (#974). `transition` is the primitive's own, for its colour motion.
 */
export const HozoInteractionContext = createContext<
  (HozoPressableInteractionState & { transition?: unknown }) | null
>(null)

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
  // Buttons use the existing modality policy: a pointer/press clears visible
  // focus, a key restores it. Keyboard-input fields instead keep it until blur.
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
