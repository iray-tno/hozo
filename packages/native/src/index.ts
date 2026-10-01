import type { ComponentRef } from 'react'
import { AccessibilityInfo, findNodeHandle, Platform, type View } from 'react-native'

import NativeHozoAccessibility from './NativeHozoAccessibility.ts'

/** What React Native hands back for a `<View>`, which is what a ref holds. */
export type HozoFocusTarget = ComponentRef<typeof View>

/**
 * Hozo's optional native module.
 *
 * One capability, admitted by the gate in
 * `docs/decisions/006-shipping-native-code.md`: moving accessibility focus on
 * Android, which [#491](https://github.com/iray-tno/hozo/issues/491) traced to an
 * API React Native does not expose to JavaScript.
 *
 * Nothing imports this package. It is *resolved* -- `@hozo/patterns` tries to
 * `require` it and falls back to what it does today when it is absent -- which is
 * what keeps every other `@hozo/*` package installable without a Gradle build.
 * Installing this one is how an application opts into the rebuild.
 */

/**
 * Moves accessibility focus to a view, or `undefined` where that cannot be done.
 *
 * The export is **conditionally a function**, and that is the API rather than an
 * implementation detail: the consumer's check is
 * `typeof moveAccessibilityFocus === 'function'`, so this one expression is both
 * "is the module linked" and "is this platform one it helps on".
 *
 * `undefined` on iOS, because iOS does not need it. `setAccessibilityFocus`
 * already reaches `UIAccessibility` and lands every time, which is why the
 * synchronous request in `dialog.native.tsx` is the whole mechanism there. A
 * second platform's module would be code with no defect behind it, and an export
 * that existed on iOS would invite one.
 *
 * `undefined` when the module is missing, which happens to a JavaScript bundle
 * that has this package and an app binary built before it was installed -- the
 * state a developer is in halfway through adding it.
 */
function resolveMover(): ((view: HozoFocusTarget) => void) | undefined {
  // Read into a local first, and the two conditions as an early return rather
  // than a ternary: that is what narrows `spec` for the closure below, where a
  // conditional expression would leave it possibly null inside one.
  const spec = NativeHozoAccessibility
  if (Platform.OS !== 'android' || !spec) return undefined
  const event = (view: HozoFocusTarget) => AccessibilityInfo.sendAccessibilityEvent(view, 'focus')

  return (view) => {
    const tag = findNodeHandle(view)
    // Nothing for a view that has been unmounted between the request and here.
    // `findNodeHandle` says that with both `null` and `undefined`, so the test is
    // the type rather than either value.
    if (typeof tag !== 'number') return
    // The event when Android refuses the action, so installing this package can
    // never be worse than not installing it. `performAccessibilityAction` returns
    // false for a view that will not take accessibility focus at that moment, and
    // a module that swallowed the refusal would have replaced a request that
    // sometimes works with one that silently did nothing.
    //
    // A rejection is treated the same way. The only ones available are a bridge
    // that went away mid-call, and the right answer to that is also "try the thing
    // that does not need it".
    spec
      .moveAccessibilityFocus(tag)
      .then((moved) => {
        if (!moved) event(view)
      })
      .catch(() => event(view))
  }
}

export const moveAccessibilityFocus: ((view: HozoFocusTarget) => void) | undefined = resolveMover()
