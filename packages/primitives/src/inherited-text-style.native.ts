import {
  HOZO_INHERITED_TEXT_FIELDS,
  type HozoInheritedTextOwn,
} from '@hozo/engine/generated/text-inheritance-protocol'
import { type StyleProp, StyleSheet, type TextStyle, type ViewStyle } from 'react-native'

export type InheritedNativeStyle = StyleProp<TextStyle & ViewStyle>
const EMPTY = Object.freeze({})

export function flattenInheritedTextStyle(style: InheritedNativeStyle) {
  if (typeof style === 'function')
    throw new Error('Native text inheritance does not assess style callbacks')
  // Read static records without cloning them. Only the View host needs its
  // own normalized copy; the compiler's/source owner's style is never edited.
  const flat = (StyleSheet.flatten(style) ?? EMPTY) as Record<string, unknown>
  for (const name of ['fontFamily', 'fontVariant', 'fontStyle']) {
    if (flat[name] != null) throw new Error(`Native text inheritance does not assess ${name}`)
  }
  // This internal first slice accepts resolved seven-field frames, not
  // Animated nodes or opaque platform colors. Do not silently certify them.
  for (const name of HOZO_INHERITED_TEXT_FIELDS) {
    const value = flat[name]
    if (value == null) continue
    const numeric = name === 'fontSize' || name === 'lineHeight' || name === 'letterSpacing'
    const textual = name === 'textAlign' || name === 'textTransform'
    if (
      (numeric && typeof value !== 'number') ||
      (textual && typeof value !== 'string') ||
      (!numeric && !textual && typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new Error(`Native text inheritance does not assess ${name}`)
  }
  return flat as typeof flat & HozoInheritedTextOwn
}
