import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'

function subscribe(notify: () => void) {
  const subscription = AppState.addEventListener('change', notify)
  return () => subscription.remove()
}

function getSnapshot() {
  return AppState.currentState === 'active'
}

/**
 * Read the live Native lifecycle, including changes between render and subscribe.
 * A mount-time useState snapshot followed by a passive listener can miss resume
 * and leave a demand Canvas on `never` until another lifecycle event arrives.
 */
export function useNativeAppActive() {
  return useSyncExternalStore(subscribe, getSnapshot)
}
