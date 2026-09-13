export interface KeyboardSubscription {
  remove(): void
}

const emptySubscription = Object.freeze({ remove() {} })

/**
 * React Native Web's keyboard contract without its TextInput registry.
 * Browsers do not reliably expose software-keyboard geometry or lifecycle
 * events, so those APIs intentionally report no keyboard just as RNW does.
 */
export const Keyboard = Object.freeze({
  isVisible(): boolean {
    return false
  },

  metrics(): undefined {
    return undefined
  },

  addListener(_eventName: string, _listener: (event: unknown) => void): KeyboardSubscription {
    return emptySubscription
  },

  dismiss(): void {
    if (typeof document === 'undefined') return
    const focused = document.activeElement
    if (focused && 'blur' in focused && typeof focused.blur === 'function') focused.blur()
  },

  removeAllListeners(_eventName?: string): void {},
  removeListener(_eventName: string, _listener: (event: unknown) => void): void {},
})
