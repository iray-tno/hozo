import type { HozoSafeAreaInsets } from '@hozo/engine/generated/safe-area'
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native'

type Side = 'top' | 'bottom'

const LONGHAND = { top: 'paddingTop', bottom: 'paddingBottom' } as const

/**
 * The padding a surface's own style gives one edge, plus the inset on that
 * edge, for a surface the pattern pins against the window's edge (#1350).
 *
 * Added to the padding rather than drawn as a spacer, because a spacer is a
 * child: in a panel with `gap-4` it brings a gap of its own, on top of the
 * inset. Read through the shorthands the way React Native resolves them, the
 * longhand first. A percentage cannot be added to, so that edge is left as
 * its class wrote it.
 */
export function insetPadding(
  style: StyleProp<ViewStyle>,
  insets: HozoSafeAreaInsets,
  sides: readonly Side[],
): ViewStyle {
  const flat = StyleSheet.flatten(style) ?? {}
  const out: { paddingTop?: number; paddingBottom?: number } = {}
  for (const side of sides) {
    if (insets[side] <= 0) continue
    const own = flat[LONGHAND[side]] ?? flat.paddingVertical ?? flat.padding ?? 0
    if (typeof own !== 'number') continue
    out[LONGHAND[side]] = own + insets[side]
  }
  return out
}
