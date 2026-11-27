import type { HozoPressableInteractionState } from '@hozo/behaviors/pressable-interaction'

export const IDLE_PEER_STATE: Readonly<HozoPressableInteractionState> = Object.freeze({
  pressed: false,
  hovered: false,
  focused: false,
  focusVisible: false,
})

export type HozoPeerSnapshot = Readonly<Record<number, HozoPressableInteractionState>>

export interface HozoPeerStore {
  publish(id: number, state: HozoPressableInteractionState): void
  clear(id: number): void
  get(id: number): HozoPressableInteractionState
  subscribe(ids: readonly number[], listener: () => void): () => void
}

function sameState(a: HozoPressableInteractionState, b: HozoPressableInteractionState): boolean {
  return (
    a.pressed === b.pressed &&
    a.hovered === b.hovered &&
    a.focused === b.focused &&
    a.focusVisible === b.focusVisible
  )
}

/**
 * Lightweight sibling-scoped interaction store for `peer-hover:`, `peer-focus:`,
 * `peer-focus-visible:`, and `peer-pressed:` on React Native.
 *
 * Subscribers register only the preceding peer IDs they depend on, so hovering
 * or focusing one peer notifies only the following siblings that read it.
 */
export function createHozoPeerStore(): HozoPeerStore {
  const states = new Map<number, HozoPressableInteractionState>()
  const listenersById = new Map<number, Set<() => void>>()

  const notify = (id: number) => {
    const listeners = listenersById.get(id)
    if (!listeners) return
    for (const listener of listeners) listener()
  }

  return {
    publish(id, next) {
      const current = states.get(id) ?? IDLE_PEER_STATE
      if (sameState(current, next)) return
      states.set(id, {
        pressed: next.pressed,
        hovered: next.hovered,
        focused: next.focused,
        focusVisible: next.focusVisible,
      })
      notify(id)
    },
    clear(id) {
      const current = states.get(id)
      if (!current) return
      states.delete(id)
      if (!sameState(current, IDLE_PEER_STATE)) {
        notify(id)
      }
    },
    get(id) {
      return states.get(id) ?? IDLE_PEER_STATE
    },
    subscribe(ids, listener) {
      for (const id of ids) {
        let bucket = listenersById.get(id)
        if (!bucket) {
          bucket = new Set()
          listenersById.set(id, bucket)
        }
        bucket.add(listener)
      }
      return () => {
        for (const id of ids) {
          const bucket = listenersById.get(id)
          if (!bucket) continue
          bucket.delete(listener)
          if (bucket.size === 0) listenersById.delete(id)
        }
      }
    },
  }
}

export function buildPeerSnapshot(
  store: HozoPeerStore | null,
  ids: readonly number[],
  previous: HozoPeerSnapshot | null,
): HozoPeerSnapshot {
  if (previous) {
    let unchanged = true
    for (const id of ids) {
      const next = store ? store.get(id) : IDLE_PEER_STATE
      const prev = previous[id]
      if (!prev || !sameState(prev, next)) {
        unchanged = false
        break
      }
    }
    if (unchanged && Object.keys(previous).length === ids.length) {
      return previous
    }
  }
  const snapshot: Record<number, HozoPressableInteractionState> = {}
  for (const id of ids) {
    snapshot[id] = store ? store.get(id) : IDLE_PEER_STATE
  }
  return snapshot
}
