import type { HozoPressableInteractionState } from '@hozo/behaviors/pressable-interaction'

export type HozoSubtreeState = Readonly<HozoPressableInteractionState>

export const IDLE_SUBTREE_STATE: HozoSubtreeState = Object.freeze({
  pressed: false,
  hovered: false,
  focused: false,
  focusVisible: false,
})

export interface HozoSubtreeDelta {
  readonly pressed?: number
  readonly hovered?: number
  readonly focused?: number
  readonly focusVisible?: number
}

export interface HozoSubtreeReporter {
  report(delta: HozoSubtreeDelta): void
}

export interface HozoSubtreeStore {
  readonly reporter: HozoSubtreeReporter
  getSnapshot(): HozoSubtreeState
  subscribe(listener: () => void): () => void
  setParent(parent: HozoSubtreeReporter | null): void
}

export function computeSubtreeDelta(
  prev: HozoSubtreeState,
  next: HozoSubtreeState,
): HozoSubtreeDelta | null {
  const pressed = Number(next.pressed) - Number(prev.pressed)
  const hovered = Number(next.hovered) - Number(prev.hovered)
  const focused = Number(next.focused) - Number(prev.focused)
  const focusVisible = Number(next.focusVisible) - Number(prev.focusVisible)
  if (pressed === 0 && hovered === 0 && focused === 0 && focusVisible === 0) {
    return null
  }
  return { pressed, hovered, focused, focusVisible }
}

/**
 * Counter-based descendant interaction store for `focus-within:`, `has-[:focus]:`,
 * and `has-hover:` on React Native.
 *
 * Tracks active descendant counts per channel and flips its snapshot only when
 * a count crosses `0 <-> 1`, forwarding every delta to any enclosing scope so
 * nested `focus-within:` / `has-*:` containers stay accurate.
 */
export function createHozoSubtreeStore(
  initialParent: HozoSubtreeReporter | null,
): HozoSubtreeStore {
  let parent = initialParent
  const counts = { pressed: 0, hovered: 0, focused: 0, focusVisible: 0 }
  let snapshot: HozoSubtreeState = IDLE_SUBTREE_STATE
  const listeners = new Set<() => void>()

  const reporter: HozoSubtreeReporter = {
    report(delta) {
      if (delta.pressed) counts.pressed = Math.max(0, counts.pressed + delta.pressed)
      if (delta.hovered) counts.hovered = Math.max(0, counts.hovered + delta.hovered)
      if (delta.focused) counts.focused = Math.max(0, counts.focused + delta.focused)
      if (delta.focusVisible) {
        counts.focusVisible = Math.max(0, counts.focusVisible + delta.focusVisible)
      }
      parent?.report(delta)
      const nextPressed = counts.pressed > 0
      const nextHovered = counts.hovered > 0
      const nextFocused = counts.focused > 0
      const nextFocusVisible = counts.focusVisible > 0
      if (
        nextPressed !== snapshot.pressed ||
        nextHovered !== snapshot.hovered ||
        nextFocused !== snapshot.focused ||
        nextFocusVisible !== snapshot.focusVisible
      ) {
        snapshot = {
          pressed: nextPressed,
          hovered: nextHovered,
          focused: nextFocused,
          focusVisible: nextFocusVisible,
        }
        for (const listener of listeners) listener()
      }
    },
  }

  return {
    reporter,
    getSnapshot() {
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setParent(nextParent) {
      parent = nextParent
    },
  }
}
