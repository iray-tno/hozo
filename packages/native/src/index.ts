import type { ComponentRef } from 'react'
import { AccessibilityInfo, findNodeHandle, Platform, type View } from 'react-native'

import NativeHozoAccessibility from './NativeHozoAccessibility.ts'

/** What React Native hands back for a `<View>`, which is what a ref holds. */
export type HozoFocusTarget = ComponentRef<typeof View>

/**
 * What one request came to, for diagnostics. See `restoreAccessibilityFocus` in
 * `NativeHozoAccessibility.ts`; `event` is the fallback when the module could not
 * be reached at all.
 */
export type HozoFocusOutcome =
  | 'landed'
  | 'resent'
  | 'resent-landed'
  | 'quiet'
  | 'unwatched'
  | 'missing'
  | 'event'

/**
 * How long to watch for the first place accessibility focus lands.
 *
 * TalkBack restores focus after a dialog closes once the windows have settled,
 * and on the reference emulator that was 250 to 470 ms after the window-focus
 * signal, plus its own 250 ms -- so its restore can come up to about 720 ms after
 * that signal, and this request is sent 250 ms after it (`dialog.native.tsx`).
 * 1.5 s covers that with room for a slower device. The window does not widen
 * what the watch reacts to: only the first landing in it counts.
 */
const WATCH_MS = 1500

/**
 * Hozo's optional native module.
 *
 * One capability, admitted under `docs/decisions/006-shipping-native-code.md`:
 * knowing whether a request for TalkBack's focus was honoured, and asking again
 * once when it was not. React Native passes JavaScript nothing about where
 * accessibility focus is, so that check cannot be written above this line.
 *
 * Nothing imports this package. The application registers it with
 * `setAccessibilityFocusMover` from `@hozo/behaviors/native` -- a library that
 * `require`d it would make it mandatory, because Metro resolves `require` at
 * bundle time.
 */

/**
 * Moves accessibility focus to a view, or `undefined` where this cannot help.
 *
 * The export is **conditionally a function**, and that is the API rather than an
 * implementation detail: `setAccessibilityFocusMover` accepts `undefined` and
 * keeps its default, so registration needs no condition around it.
 *
 * `undefined` on iOS, because iOS does not need it: `setAccessibilityFocus`
 * already reaches `UIAccessibility` and lands every time. `undefined` when the
 * module is missing, which happens to a JavaScript bundle that has this package
 * and an app binary built before it was installed.
 *
 * Resolves what happened, which `Dialog` ignores and a diagnostic can log.
 */
function resolveMover(): ((view: HozoFocusTarget) => Promise<HozoFocusOutcome>) | undefined {
  // Read into a local first, and the two conditions as an early return rather
  // than a ternary: that is what narrows `spec` for the closure below.
  const spec = NativeHozoAccessibility
  if (Platform.OS !== 'android' || !spec) return undefined

  return async (view) => {
    const tag = findNodeHandle(view)
    // Nothing for a view that has been unmounted between the request and here.
    // `findNodeHandle` says that with both `null` and `undefined`, so the test is
    // the type rather than either value.
    if (typeof tag !== 'number') return 'missing'
    try {
      return (await spec.restoreAccessibilityFocus(tag, WATCH_MS)) as HozoFocusOutcome
    } catch {
      // The only rejection available is a bridge that went away mid-call, and
      // the answer to that is the request that does not need it -- so installing
      // this package can never leave a dialog worse off than not installing it.
      AccessibilityInfo.sendAccessibilityEvent(view, 'focus')
      return 'event'
    }
  }
}

export const moveAccessibilityFocus:
  | ((view: HozoFocusTarget) => Promise<HozoFocusOutcome>)
  | undefined = resolveMover()
