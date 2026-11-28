// Whether the reader asked for less motion, on Web. Yes without a browser,
// so server rendering and the first client pass agree and nothing moves
// before the answer is known.

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function query(): MediaQueryList | undefined {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : undefined
}

function subscribe(listener: () => void) {
  const list = query()
  list?.addEventListener?.('change', listener)
  return () => list?.removeEventListener?.('change', listener)
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query()?.matches ?? true,
    () => true,
  )
}
