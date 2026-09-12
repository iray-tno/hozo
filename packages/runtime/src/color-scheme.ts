import { useSyncExternalStore } from 'react'

import { createStore } from './ambient.ts'

export type ColorSchemeName = 'light' | 'dark'

// React Native Web reads light when no browser exists. Keeping that server
// snapshot makes hydration deterministic; the first client snapshot then
// corrects it if the browser prefers dark.
const colorSchemeStore = createStore<ColorSchemeName>('light')
let listening = false

function canUseMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function ensureListening() {
  if (listening || !canUseMatchMedia()) return
  listening = true
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const update = ({ matches }: Pick<MediaQueryList, 'matches'>) => {
    colorSchemeStore.set(matches ? 'dark' : 'light')
  }
  update(query)
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', update)
  } else {
    // Safari before 14 implements the original MediaQueryList API only.
    query.addListener(update)
  }
}

function subscribe(listener: () => void) {
  ensureListening()
  return colorSchemeStore.subscribe(listener)
}

function getSnapshot() {
  ensureListening()
  return colorSchemeStore.get()
}

/** React Native's color-scheme hook with one shared browser subscription. */
export function useColorScheme(): ColorSchemeName | null {
  return useSyncExternalStore(subscribe, getSnapshot, colorSchemeStore.get)
}
