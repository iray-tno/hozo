// What `Presence` tells the elements that animate out inside it, on
// Native (decision 007, amendment 1).
//
// On Web the same thing travels as an attribute, `data-state`, and CSS
// does the rest. React Native has no attributes to select on, so the
// state is a context instead, and `HozoAnimated` -- the component the
// compiler puts in place of an element with a `data-[state=closed]:`
// class -- reads it.

import { createContext } from 'react'

export type PresenceState = 'open' | 'closed'

export interface PresenceContextValue {
  state: PresenceState
  /**
   * Called by an element that will animate out, once, on mount. `Presence`
   * waits for every registered element before it removes its child, and
   * removes it at once when none registered. The returned function
   * unregisters.
   */
  register(id: symbol, durationMs: number): () => void
  /** Called by a registered element when its exit animation has ended. */
  done(id: symbol): void
}

export const PresenceContext = createContext<PresenceContextValue | null>(null)
