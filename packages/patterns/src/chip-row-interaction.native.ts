import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { GestureResponderEvent } from 'react-native'

const ROW = 1
const TOGGLE = 2
const REMOVE = 4

/**
 * A non-focusable ancestor is hovered/active when its descendants are, but
 * never focused by them (Selectors 4 user-action pseudo-classes). No extra
 * Pressable: it would introduce a third responder/accessibility control.
 * Source bits keep one child's exit from clearing another child's state.
 */
export function useChipRowInteraction(selectable: boolean, disabled: boolean | undefined) {
  const { state, handlers } = usePressableInteraction()
  const masks = useRef({ hovered: 0, pressed: 0 })
  const touches = useRef<Set<number> | null>(null)
  if (touches.current === null) touches.current = new Set()

  const update = useCallback(
    (kind: 'hovered' | 'pressed', source: number, active: boolean) => {
      const before = masks.current[kind]
      const after = active ? before | source : before & ~source
      masks.current[kind] = after
      if (Boolean(before) === Boolean(after)) return
      if (kind === 'hovered') {
        if (after) handlers.hoverIn()
        else handlers.hoverOut()
      } else if (after) handlers.pressIn()
      else handlers.pressOut()
    },
    [handlers],
  )

  // A disabled/unmounted toggle might never send press-out. The row's
  // hover can still be real; only an absent child loses its hover bit.
  useEffect(() => {
    if (!selectable) {
      update('hovered', TOGGLE, false)
      update('pressed', TOGGLE, false)
    }
    if (disabled) {
      touches.current?.clear()
      update('pressed', ROW | TOGGLE | REMOVE, false)
    }
  }, [disabled, selectable, update])

  const events = useMemo(() => {
    const child = (source: number) => ({
      onHoverIn: () => update('hovered', source, true),
      onHoverOut: () => update('hovered', source, false),
      onPressIn: () => {
        if (!disabled) update('pressed', source, true)
      },
      onPressOut: () => update('pressed', source, false),
    })
    const touch = (event: GestureResponderEvent, active: boolean) => {
      if (disabled) return
      // changedTouches identifies the contacts that belong to this event,
      // not every contact elsewhere on the screen. A sibling's release must
      // not erase a second finger still inside the row.
      for (const contact of event.nativeEvent.changedTouches) {
        if (active) touches.current?.add(contact.identifier)
        else touches.current?.delete(contact.identifier)
      }
      update('pressed', ROW, Boolean(touches.current?.size))
    }
    return {
      row: {
        onPointerEnter: () => update('hovered', ROW, true),
        onPointerLeave: () => {
          // Leaving this ancestor also leaves every child. Clear a missed
          // child hover-out without subscribing outside the component.
          update('hovered', ROW | TOGGLE | REMOVE, false)
        },
        onTouchStartCapture: (event: GestureResponderEvent) => touch(event, true),
        onTouchEndCapture: (event: GestureResponderEvent) => touch(event, false),
        onTouchCancelCapture: (event: GestureResponderEvent) => touch(event, false),
      },
      toggle: child(TOGGLE),
      remove: child(REMOVE),
    }
  }, [disabled, update])
  return { state, events }
}
