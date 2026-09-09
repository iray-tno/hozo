// The dialog `@hozo/core` publishes on React Native, which is the one the
// compiler emits.
//
// This file used to be a byte-for-byte copy of
// `@hozo/behaviors/src/dialog.native.tsx` -- the same `Modal`, the same
// inner `View`, the same four accessibility props. Two implementations of
// one component, and they had already drifted in the way two copies do:
// neither carried `testID`, so the bug was in both, and fixing the one the
// compiler emits would have left this one wrong.
//
// It delegates now, the way `@hozo/semantics`' `Details` delegates to
// `HozoDetails` and `@hozo/typography`'s `Link` to `HozoLink`.

import { HozoDialog } from '@hozo/runtime'
import type { ComponentType, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export interface DialogProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and
   * the type still has to accept it, because an app is type-checked
   * against the source the compiler reads rather than its output.
   */
  className?: string
  open?: boolean
  onClose?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
  testID?: string
  children?: ReactNode
}

/**
 * `HozoDialog` seen with its native props, which are not the ones the
 * type resolver hands over.
 *
 * A package resolves `@hozo/runtime`'s types through the Web entry
 * whichever platform it is building for, because `exports` carries a
 * single `types` and this package compiles both halves in one `tsc` run.
 * The Web half takes a `className`; the module Metro loads takes a
 * `StyleProp<ViewStyle>`. Fourth occurrence of the same boundary --
 * `@hozo/semantics`, `@hozo/typography` and `primitives.native.tsx` carry
 * the same line.
 *
 * Cast to a component and rendered as one rather than called, for the
 * reason `primitives.native.tsx` gives: calling it loses its identity to
 * React and breaks the moment it uses a hook, which this one does.
 */
const NativeDialog = HozoDialog as unknown as ComponentType<DialogProps>

export function Dialog(props: DialogProps) {
  return <NativeDialog {...props} />
}
