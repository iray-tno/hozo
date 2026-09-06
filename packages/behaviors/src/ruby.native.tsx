// Ruby that is read once.
//
// `<ruby>漢字<rt>かんじ</rt></ruby>` on the Web is one element a browser
// knows how to announce. React Native has no ruby layout, so both halves
// are `Text` -- and nested `Text` is flattened into a single
// accessibility node, so a screen reader reads the base and then the
// reading: 「漢字かんじ」. The word twice, the second time spelled out.
//
// `accessible={false}` on the annotation does not help, because the
// flattening happens above it: the parent's label is built from the text
// it contains, whatever the children say about themselves. The lever that
// does work is the parent's own `accessibilityLabel`, which replaces the
// children rather than being assembled from them.
//
// The compiler writes that label itself when the base text is static,
// which is most ruby. This pair is for when it is not -- the same
// arrangement `HozoRelativeText` has, and the same reason: a value only
// React Native can see.

import { Children, isValidElement, type ReactNode } from 'react'
import { type StyleProp, Text, type TextStyle } from 'react-native'

export interface HozoRubyProps {
  children?: ReactNode
  /** The author's own, which wins: they know what the word is. */
  accessibilityLabel?: string
  style?: StyleProp<TextStyle>
  testID?: string
}

export interface HozoRubyTextProps {
  children?: ReactNode
  style?: StyleProp<TextStyle>
  testID?: string
}

/**
 * The reading, and the half that must not be announced.
 *
 * Declared before `HozoRuby` because that one compares against it by
 * identity to decide what the word is.
 */
export function HozoRubyText({ children, ...props }: HozoRubyTextProps) {
  return (
    <Text accessible={false} {...props}>
      {children}
    </Text>
  )
}

/** Every string under a node, with the readings left out. */
function baseText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child)
      if (!isValidElement(child)) return ''
      if (child.type === HozoRubyText) return ''
      const nested = (child.props as { children?: ReactNode }).children
      return nested === undefined ? '' : baseText(nested)
    })
    .join('')
}

export function HozoRuby({ children, accessibilityLabel, ...props }: HozoRubyProps) {
  const label = accessibilityLabel ?? baseText(children)
  return (
    <Text accessibilityLabel={label === '' ? undefined : label} {...props}>
      {children}
    </Text>
  )
}
