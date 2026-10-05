// Keeping an element mounted while it animates out, on React Native
// (decision 007, slice 2). The Web half is `./presence.ts`.
//
// There is no computed style to read an exit's length from here, so the
// caller says when it is over: it runs its own `Animated` exit while
// `state` is `'closed'` and calls `done` from the completion callback.

import { useCallback, useState } from 'react'

export type PresenceState = 'open' | 'closed'

export interface PresenceBinding {
  /** Whether to render the element at all. */
  mounted: boolean
  state: PresenceState
  /** Ends the exit. Ignored once the element is shown again. */
  done: () => void
}

export function usePresence(show: boolean): PresenceBinding {
  const [mounted, setMounted] = useState(show)
  if (show && !mounted) setMounted(true)
  const done = useCallback(() => {
    if (!show) setMounted(false)
  }, [show])
  return { mounted, state: show ? 'open' : 'closed', done }
}
