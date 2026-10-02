import type { ComponentRef } from 'react'
import { AccessibilityInfo, type View } from 'react-native'

export type HozoFocusTarget = ComponentRef<typeof View>
export type HozoFocusMover = (view: HozoFocusTarget) => void

/**
 * Moving accessibility focus, with `@hozo/native` able to take over.
 *
 * ## Registered, not resolved, and that is a correction
 *
 * `docs/decisions/006-shipping-native-code.md` says the capability is reached
 * "through a resolved provider, never imported", pointing at
 * `packages/engine/src/safe-area.native.ts:50`, which does
 * `try { require('react-native-safe-area-context') } catch {}`. That shape does
 * not transfer here, and the reason is Metro rather than taste.
 *
 * Metro resolves `require` at bundle time. A literal `require` of a package that
 * is not installed is a **build failure**, `try`/`catch` or not -- the catch runs
 * at runtime and the bundler never gets there. Safe areas get away with it
 * because that module is only in the graph when the compiler emitted a safe-area
 * class: a project that writes none never imports it. This module is in the graph
 * of every application that renders a `Dialog`, so a `require` here would make an
 * optional package mandatory, and would break every existing app on upgrade.
 *
 * So the application hands the capability in, in two lines next to wherever it
 * registers its root component:
 *
 * ```ts
 * import { setAccessibilityFocusMover } from '@hozo/behaviors/native'
 * import { moveAccessibilityFocus } from '@hozo/native'
 *
 * setAccessibilityFocusMover(moveAccessibilityFocus)
 * ```
 *
 * `moveAccessibilityFocus` is `undefined` on iOS and when the native module is
 * not in the binary, and the setter accepts that and keeps the default -- so the
 * call needs no condition around it.
 *
 * ## The default is what this library has always done
 *
 * `AccessibilityInfo.sendAccessibilityEvent(view, 'focus')`, which works about
 * half the time on Android (#484). An application that registers nothing is
 * exactly as well off as it was, which is the third part of the decision's gate
 * and the reason the capability was admitted at all.
 *
 * ## Why this is in `@hozo/behaviors/native`
 *
 * It has one consumer today -- `Dialog` -- and the first draft of this lived in
 * `@hozo/patterns` for that reason. Registration moved it: a module holding one
 * mutable binding costs nothing to load, where a provider resolution would have
 * run a `require` in every package that imported it, and the application doing
 * the registering should not have to reach into a widget package to do it.
 * `@hozo/behaviors/native` is the entry point that already exists for API with no
 * Web counterpart.
 */
let registered: HozoFocusMover | undefined

/**
 * Hand over a better way to move accessibility focus, or `undefined` to stop.
 *
 * Idempotent and last-wins. Registering twice is a sign of two roots, which an
 * application can legitimately have -- a test harness mounting its own -- and
 * neither a throw nor a warning would help it.
 */
export function setAccessibilityFocusMover(mover: HozoFocusMover | undefined | null): void {
  registered = mover ?? undefined
}

/** Whether something has been registered. Read by diagnostics, not by behaviour. */
export function hasAccessibilityFocusMover(): boolean {
  return registered !== undefined
}

/**
 * Put accessibility focus on `view`.
 *
 * Read at call time rather than captured, because registration happens during the
 * application's startup and a module that captured the default at load would
 * never see it.
 */
export function moveAccessibilityFocus(view: HozoFocusTarget): void {
  if (registered) {
    registered(view)
    return
  }
  AccessibilityInfo.sendAccessibilityEvent(view, 'focus')
}
