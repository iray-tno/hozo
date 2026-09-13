type Listener = () => void

interface Store<T> {
  get: () => T
  set: (next: T) => void
  subscribe: (listener: Listener) => () => void
}

/** Tiny shared store for browser implementations of React Native singleton APIs. */
export function createStore<T>(
  initial: T,
  equals: (left: T, right: T) => boolean = Object.is,
): Store<T> {
  const listeners = new Set<Listener>()
  let snapshot = initial
  return {
    get: () => snapshot,
    set(next) {
      if (equals(next, snapshot)) return
      snapshot = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
