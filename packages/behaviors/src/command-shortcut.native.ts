import type { CommandShortcutOptions } from './command-shortcut.ts'

export type { CommandShortcutOptions }

export function isApplePlatform(): boolean {
  return false
}

/**
 * Nothing on React Native: a phone has no ⌘K, and a hardware keyboard reaches
 * an application through APIs React Native does not expose as one event. The
 * palette is opened from a control the application draws. Kept as a hook so a
 * screen written once calls it on both platforms.
 */
export function useCommandShortcut(_onTrigger: () => void, _options: CommandShortcutOptions = {}) {}
