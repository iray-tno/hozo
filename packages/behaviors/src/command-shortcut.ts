import { useEffect, useRef } from 'react'

export interface CommandShortcutOptions {
  /** The letter, pressed with ⌘ on Apple platforms and Ctrl elsewhere; `k` by default. */
  key?: string
  /** Off while something else owns the keyboard. */
  enabled?: boolean
}

/** ⌘ on an Apple platform, Ctrl elsewhere -- the modifier each one's own shortcuts use. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/**
 * Calls `onTrigger` for ⌘K on a Mac and Ctrl+K elsewhere, from anywhere on the
 * page (#152).
 *
 * The browser's default is prevented only for the press that is handled:
 * Ctrl+K is Chrome's "search from the address bar", and taking it away when
 * nothing opens would be taking it for nothing. A press during IME
 * composition is not a shortcut -- the composition owns the keyboard -- and
 * neither is a held key repeating.
 *
 * A behaviour rather than part of `CommandPalette`, because a shortcut is
 * useful without one: to focus a search field, or open a different panel.
 */
export function useCommandShortcut(onTrigger: () => void, options: CommandShortcutOptions = {}) {
  const { key = 'k', enabled = true } = options
  const latest = useRef(onTrigger)
  latest.current = onTrigger
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return
    const apple = isApplePlatform()
    const handle = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return
      const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
      if (!modifier || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== key.toLowerCase()) return
      event.preventDefault()
      latest.current()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [enabled, key])
}
