// What React Native's JavaScript cannot do, and why this package exists.
//
// `AccessibilityInfo.sendAccessibilityEvent(view, 'focus')` sends
// `AccessibilityEvent.TYPE_VIEW_FOCUSED` -- traced through the Fabric path in
// 0.87, it ends at `View.sendAccessibilityEvent(...)` in
// `SurfaceMountingManager`. That is a notification to the accessibility
// framework, and TalkBack acts on it or does not. On Android it does not, when
// a `Modal` has just closed: the activity's ordinary window focus comes back
// before the accessibility window state does, and an event sent into that gap
// is dropped. Measured in #484 -- the boundary sat between 175 and 200ms on
// one emulator, reproduced twelve rounds out of twelve.
//
// `AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS` is the action that moves
// focus rather than announcing that it moved, and React Native exposes it
// nowhere. That is the whole content of this package.
import { findNodeHandle } from 'react-native'

import NativeHozoAccessibility from './specs/NativeHozoAccessibility.ts'

/** Whether the native module is present in this app. */
export function hasNativeAccessibility(): boolean {
  return NativeHozoAccessibility !== null && NativeHozoAccessibility !== undefined
}

/**
 * Move accessibility focus to a view, and report whether it was possible.
 *
 * `false` means the module is absent or the view is gone, and the caller
 * should fall back to `sendAccessibilityEvent`. It never throws: an optional
 * package that throws on absence is not optional.
 */
export function moveAccessibilityFocus(view: unknown): boolean {
  const module = NativeHozoAccessibility
  if (!module) return false
  // `typeof` rather than `=== null`. React Native declares the result as a
  // union that includes `undefined` as well, and a null check leaves that case
  // to reach a parameter typed `number` -- which is the one thing CI caught
  // here.
  const tag = findNodeHandle(view as never)
  if (typeof tag !== 'number') return false
  module.moveAccessibilityFocus(tag)
  return true
}
