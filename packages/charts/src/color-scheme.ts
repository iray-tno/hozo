// The page's colour scheme on Web, for a `{ light, dark }` palette. Light
// without a browser, so server rendering and the first client pass agree;
// the client then corrects it if the reader prefers dark.

import { useSyncExternalStore } from 'react'
import type { ColorScheme } from './theme.tsx'

const QUERY = '(prefers-color-scheme: dark)'

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

export function useSystemScheme(): ColorScheme {
  return useSyncExternalStore(
    subscribe,
    () => (query()?.matches ? 'dark' : 'light'),
    () => 'light',
  )
}
