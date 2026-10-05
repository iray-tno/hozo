// Keeps a child mounted while it animates out (decision 007, slice 2).
//
// React removes an element the moment it stops being rendered, so nothing
// can animate after that. `Presence` holds on to its child after `show`
// turns false, tells it it is leaving, and lets it go when every element
// inside that animates out has finished.
//
// The Web half is `./presence.tsx`. Both are written against the same
// class: `data-[state=closed]:`.

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PresenceContext, type PresenceContextValue } from './presence-context.ts'

export interface PresenceProps {
  /** Whether the child is shown. Turning it false starts the exit. */
  show: boolean
  children?: ReactNode
}

/**
 * How long past the longest registered transition to wait for one that
 * never reports. An animation interrupted by an unmount above, or one the
 * runtime dropped, would otherwise keep the child on screen for good.
 */
const GRACE_MS = 100

export function Presence({ show, children }: PresenceProps) {
  const [mounted, setMounted] = useState(show)
  // Set during render rather than in an effect, so a child that is shown
  // again appears in the same commit instead of one frame late.
  if (show && !mounted) setMounted(true)

  const exiting = useRef(new Map<symbol, number>())
  const waiting = useRef(new Set<symbol>())

  const finish = useCallback(() => {
    waiting.current.clear()
    setMounted(false)
  }, [])

  useEffect(() => {
    // Shown again before the exit ended: whatever was leaving is staying.
    if (show) {
      waiting.current.clear()
      return
    }
    if (!mounted) return
    if (exiting.current.size === 0) {
      finish()
      return
    }
    waiting.current = new Set(exiting.current.keys())
    const longest = Math.max(...exiting.current.values())
    const timer = setTimeout(finish, longest + GRACE_MS)
    return () => clearTimeout(timer)
  }, [show, mounted, finish])

  const register = useCallback((id: symbol, durationMs: number) => {
    exiting.current.set(id, durationMs)
    return () => {
      exiting.current.delete(id)
      waiting.current.delete(id)
    }
  }, [])

  const done = useCallback(
    (id: symbol) => {
      if (!waiting.current.delete(id)) return
      if (waiting.current.size === 0) finish()
    },
    [finish],
  )

  const value = useMemo<PresenceContextValue>(
    () => ({ state: show ? 'open' : 'closed', register, done }),
    [show, register, done],
  )

  if (!mounted) return null
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}
