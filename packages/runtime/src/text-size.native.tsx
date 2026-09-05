// The size a relative one scales against, where the compiler could not
// resolve it.
//
// React Native offers nothing for this. Its `fontSize` is a number of
// points with no `em`, a nested `Text` inherits visually but cannot read
// what it inherited, and the only ancestor context the platform exposes --
// `TextAncestorContext` -- is a boolean saying whether there is a `Text`
// above at all.
//
// So Hozo resolves it, and prefers to do so at build time: a `<Small>`
// under a `text-xl` compiles to a plain `<Text>` with a number in a
// stylesheet, and neither of these components appears. They are for the
// case the compiler cannot see -- an author's `style={{ fontSize: 20 }}`
// or a `{...spread}`, which is a size that exists only once React Native
// has evaluated it.
//
// The same pattern `HozoGrid` and `HozoSpaced` already follow: static
// where the answer is knowable, a component where it is not.

import { type ReactNode, useContext } from 'react'
import { type StyleProp, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native'

import { HozoTextSizeContext } from './text-size.ts'

export interface HozoTextSizeProps extends Omit<TextProps, 'style'> {
  children?: ReactNode
  style?: StyleProp<TextStyle>
}

/**
 * A `Text` that says what size it resolved to.
 *
 * Emitted for an element whose style the compiler could not read and
 * which has something below it that scales against the size. `flatten`
 * is what React Native itself does with a style array, so this reads the
 * value that applied rather than one of the values that contributed.
 */
export function HozoTextSize({ children, style, ...props }: HozoTextSizeProps) {
  const inherited = useContext(HozoTextSizeContext)
  const size = StyleSheet.flatten(style)?.fontSize
  const resolved = typeof size === 'number' ? size : inherited
  return (
    <HozoTextSizeContext.Provider value={resolved}>
      <Text style={style} {...props}>
        {children}
      </Text>
    </HozoTextSizeContext.Provider>
  )
}

export interface HozoRelativeTextProps extends HozoTextSizeProps {
  /** The multiplier, from the compiler's own table. */
  hozoRelative: number
}

/**
 * A `Text` sized as a fraction of the text around it.
 *
 * Publishes what it resolved to as well as reading it, so `<Small>`
 * inside a `<Small>` compounds the way `small small` does in a browser.
 * An explicit size in `style` still wins: it is later in the array, which
 * is how React Native resolves the two.
 */
export function HozoRelativeText({
  children,
  hozoRelative,
  style,
  ...props
}: HozoRelativeTextProps) {
  const base = useContext(HozoTextSizeContext)
  const resolved = Math.round(base * hozoRelative)
  const flattened = StyleSheet.flatten(style)?.fontSize
  return (
    <HozoTextSizeContext.Provider value={typeof flattened === 'number' ? flattened : resolved}>
      <Text style={[{ fontSize: resolved }, style]} {...props}>
        {children}
      </Text>
    </HozoTextSizeContext.Provider>
  )
}
