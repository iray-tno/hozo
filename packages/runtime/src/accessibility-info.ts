import { createStore } from './ambient.ts'

export type AccessibilityChangeEventName = 'reduceMotionChanged' | 'screenReaderChanged'
export type AccessibilityChangeHandler = (enabled: boolean) => void

// These are React Native Web's server answers. Screen-reader presence cannot
// be detected by a browser; consumers that need a real answer must treat it
// as an unknown capability, just as they do when using RNW directly.
const reduceMotionStore = createStore(true)
const screenReaderStore = createStore(true)
let listening = false

function canUseMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function ensureReduceMotionListener() {
  if (listening || !canUseMatchMedia()) return
  listening = true
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  const update = ({ matches }: Pick<MediaQueryList, 'matches'>) => {
    reduceMotionStore.set(matches)
  }
  update(query)
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', update)
  } else {
    query.addListener(update)
  }
}

const subscriptions = new Map<
  AccessibilityChangeEventName,
  Map<AccessibilityChangeHandler, Set<() => void>>
>()

function storeFor(eventName: AccessibilityChangeEventName) {
  return eventName === 'reduceMotionChanged' ? reduceMotionStore : screenReaderStore
}

/** The browser surface React Native Web exposes for accessibility facts. */
export const AccessibilityInfo = {
  isScreenReaderEnabled(): Promise<boolean> {
    return Promise.resolve(screenReaderStore.get())
  },

  isReduceMotionEnabled(): Promise<boolean> {
    ensureReduceMotionListener()
    return Promise.resolve(reduceMotionStore.get())
  },

  /** @deprecated Alias retained for React Native Web compatibility. */
  fetch(): Promise<boolean> {
    return this.isScreenReaderEnabled()
  },

  addEventListener(eventName: AccessibilityChangeEventName, handler: AccessibilityChangeHandler) {
    if (eventName === 'reduceMotionChanged') ensureReduceMotionListener()
    const store = storeFor(eventName)
    const remove = store.subscribe(() => handler(store.get()))
    const handlers = subscriptions.get(eventName) ?? new Map()
    const removals = handlers.get(handler) ?? new Set()
    removals.add(remove)
    handlers.set(handler, removals)
    subscriptions.set(eventName, handlers)
    return {
      remove() {
        remove()
        removals.delete(remove)
        if (removals.size === 0) handlers.delete(handler)
        if (handlers.size === 0) subscriptions.delete(eventName)
      },
    }
  },

  /** @deprecated Use the subscription's `remove()` method. */
  removeEventListener(
    eventName: AccessibilityChangeEventName,
    handler: AccessibilityChangeHandler,
  ) {
    const handlers = subscriptions.get(eventName)
    const removals = handlers?.get(handler)
    if (!handlers || !removals) return
    for (const remove of removals) remove()
    handlers.delete(handler)
    if (handlers.size === 0) subscriptions.delete(eventName)
  },

  // Browsers own focus and announcements through DOM semantics and live
  // regions. RNW exposes these methods as no-ops, so keep that contract.
  setAccessibilityFocus(_reactTag: number): void {},
  announceForAccessibility(_announcement: string): void {},
}
