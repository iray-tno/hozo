import { HozoLink, HozoRuby, HozoRubyText, HozoTextSizeContext } from '@hozo/runtime'
import { hozoPreflight } from '@hozo/runtime/project'
import React, { type ComponentProps, type ReactNode, useContext } from 'react'
// The components rather than their names. These files used to render
// `React.createElement('View')`, and React Native resolves a string tag
// through its view config registry, where the registered names are
// `RCTView` and `RCTText` -- never `View` or `Text`. Every one of these
// would have thrown "View config getter callback for component `View`
// must be a function" on the first render. Nothing caught it because
// nothing imported these files: the tests next to them render the Web
// half through `react-dom/server`.
import {
  type AccessibilityRole,
  Text as RNText,
  type StyleProp,
  StyleSheet,
  type TextStyle,
} from 'react-native'
import { BARE_TEXT_SIZE_RATIOS, TEXT_SIZE_RATIOS } from './text-size.ts'

export { BARE_TEXT_SIZE_RATIOS, TEXT_SIZE_RATIOS } from './text-size.ts'

export interface TypographyNativeProps {
  /**
   * Tailwind classes, read by the compiler and gone by runtime.
   *
   * The Web half of this file has always declared it; this half never
   * did, and nothing noticed because the `react-native` export condition
   * carried no `types`, so a React Native app was type-checked against
   * the Web declarations instead. Uncompiled, the prop is simply ignored
   * here -- which is what the fallback components are for.
   */
  className?: string
  children?: ReactNode
  /**
   * React Native's own types rather than `any` and `string`.
   *
   * The Web half of this file says `CSSProperties`. This half agreed with
   * anything, so a Web-only style reached a native `Text` in silence --
   * the same erasure `@hozo/tailwind-conformance` exists to catch one
   * layer down.
   */
  style?: StyleProp<TextStyle>
  testID?: string
  nativeID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityRole?: AccessibilityRole
  accessible?: boolean
  numberOfLines?: number
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip'
}

export type TextProps = TypographyNativeProps
export type SemanticTextProps = TypographyNativeProps

export interface HeadingProps extends TypographyNativeProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6
}

/**
 * The size the text around this is drawn at.
 *
 * `@hozo/runtime`'s, not one of this package's own. The compiler emits
 * `HozoTextSize` for an element whose size it could not read, and that
 * publishes into this context -- so a compiled ancestor and one of the
 * components below, rendered uncompiled, agree about the base. Two
 * contexts would have been two answers.
 *
 * React Native offers nothing to build this on. Its `fontSize` is a
 * number of points with no relative unit, a nested `Text` inherits
 * visually but cannot read what it inherited, and the only ancestor
 * context the platform exposes -- `TextAncestorContext` -- is a boolean
 * saying whether there is a `Text` above at all.
 *
 * The default is React Native's own, and the constants this replaced --
 * 11, 11, 12 -- are exactly the ratios applied to it.
 */
const TextSize = HozoTextSizeContext

function relative(ratio: number, base: number) {
  return Math.round(base * ratio)
}

// Minimal fallback helper when running uncompiled on Native
export function Text({ children, style, ...props }: TextProps) {
  const size = StyleSheet.flatten(style)?.fontSize
  const text = React.createElement(RNText, { style, ...props }, children)
  // Only when this one names a size. A `Text` that says nothing about it
  // should hand on whatever it was given rather than reset the scale.
  if (size === undefined) return text
  return <TextSize.Provider value={size}>{text}</TextSize.Provider>
}

export function Paragraph(props: SemanticTextProps) {
  return <Text {...props} />
}

export function Heading({
  level = 1,
  accessibilityRole = 'header',
  style,
  ...props
}: HeadingProps) {
  // Preflight resets headings to inherited size and weight. Without it,
  // reproduce the browser's heading defaults that Native does not have.
  const base = useContext(TextSize)
  const ratio = BARE_TEXT_SIZE_RATIOS.heading[Math.min(6, Math.max(1, level)) - 1] as number
  const defaultStyle = hozoPreflight
    ? undefined
    : { fontSize: relative(ratio, base), fontWeight: 'bold' as const }
  return <Text accessibilityRole={accessibilityRole} style={[defaultStyle, style]} {...props} />
}

export function Strong({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ fontWeight: 'bold' }, style]} {...props} />
}

export function Emphasis({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ fontStyle: 'italic' }, style]} {...props} />
}

export function Underline({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ textDecorationLine: 'underline' }, style]} {...props} />
}

export function Strikethrough({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ textDecorationLine: 'line-through' }, style]} {...props} />
}

export const Del = Strikethrough

export function Sub({ style, ...props }: TypographyNativeProps) {
  const base = useContext(TextSize)
  const ratios = hozoPreflight ? TEXT_SIZE_RATIOS : BARE_TEXT_SIZE_RATIOS
  return <Text style={[{ fontSize: relative(ratios.sub, base) }, style]} {...props} />
}

export function Sup({ style, ...props }: TypographyNativeProps) {
  const base = useContext(TextSize)
  const ratios = hozoPreflight ? TEXT_SIZE_RATIOS : BARE_TEXT_SIZE_RATIOS
  return <Text style={[{ fontSize: relative(ratios.sup, base) }, style]} {...props} />
}

export function Code({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ fontFamily: 'monospace' }, style]} {...props} />
}

export function Small({ style, ...props }: TypographyNativeProps) {
  const base = useContext(TextSize)
  const ratios = hozoPreflight ? TEXT_SIZE_RATIOS : BARE_TEXT_SIZE_RATIOS
  return (
    <Text style={[{ fontSize: relative(ratios.small, base), opacity: 0.8 }, style]} {...props} />
  )
}

export function Mark({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ backgroundColor: '#fef08a' }, style]} {...props} />
}

/** Recursively replaces normal spaces with Unicode non-breaking spaces (\u00A0) */
function replaceSpacesWithNbsp(node: ReactNode): ReactNode {
  if (typeof node === 'string') {
    return node.replace(/ /g, '\u00A0')
  }
  if (Array.isArray(node)) {
    return React.Children.map(node, replaceSpacesWithNbsp)
  }
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: ReactNode }>
    if (element.props?.children) {
      return React.cloneElement(element, {
        children: replaceSpacesWithNbsp(element.props.children),
      })
    }
  }
  return node
}

export function NoBreak({ children, ...props }: TypographyNativeProps) {
  return <Text {...props}>{replaceSpacesWithNbsp(children)}</Text>
}

/**
 * A Native style handed over as if it were a Web one -- a resolver's
 * limit rather than a claim about the value.
 *
 * A package resolves `@hozo/runtime`'s types through the Web entry
 * whichever platform it is building for, because `exports` carries a
 * single `types` and this package compiles both halves in one `tsc` run.
 * So these are seen with `style?: CSSProperties` here while the module
 * Metro loads takes `StyleProp<TextStyle>`. `@hozo/semantics` has the
 * same line for the same reason.
 */
const asWeb = (style: TypographyNativeProps['style']) =>
  style as unknown as ComponentProps<typeof HozoRuby>['style']
/**
 * Ruby, sharing the pair the Native backend emits.
 *
 * React Native flattens nested `Text` into one accessibility node, so a
 * screen reader read the base and then the reading: 「漢字かんじ」. The
 * `accessible={false}` that used to be on the annotation could not stop
 * it -- the flattening happens above, and the parent's label is built
 * from the text it contains whatever the children say about themselves.
 */
export function Ruby({ children, accessibilityLabel, style, ...props }: TypographyNativeProps) {
  return (
    <HozoRuby accessibilityLabel={accessibilityLabel} style={asWeb(style)} {...props}>
      {children}
    </HozoRuby>
  )
}

export function RubyText({ style, children, ...props }: TypographyNativeProps) {
  // Half the size of the text it annotates, against the size `Text`
  // published; `fontSize: '0.65em'` was here and React Native ignored it.
  const base = useContext(TextSize)
  return (
    <HozoRubyText
      style={asWeb([{ fontSize: relative(TEXT_SIZE_RATIOS.rubyText, base), opacity: 0.85 }, style])}
      {...props}
    >
      {children}
    </HozoRubyText>
  )
}
export interface LinkProps extends TypographyNativeProps {
  href: string
  external?: boolean
  replace?: boolean
  prefetch?: boolean
  target?: string
  rel?: string
  download?: boolean | string
  onPress?: (event: { defaultPrevented?: boolean }) => void
}

/**
 * A link, which on this platform is a Pressable that opens a URL.
 *
 * That was written out here and again in `@hozo/runtime` -- the second
 * being what the compiler emits for this very component, so the two
 * halves of one `<Link>` had separate implementations of opening a URL,
 * of respecting a handler that prevented it, and of wrapping a string
 * child so React Native does not throw on it. They had already drifted
 * on the role: this one let a caller's `accessibilityRole` win and the
 * other overwrote it, which was the bug in #289.
 *
 * `target`, `rel`, and `download` stay in the prop type and are dropped
 * here. `external` reaches HozoLink because it decides whether an installed
 * application router may handle the destination before platform fallback.
 */
export function Link({
  href,
  onPress,
  children,
  external,
  replace,
  prefetch,
  target: _target,
  rel: _rel,
  download: _download,
  style,
  ...props
}: LinkProps) {
  return (
    <HozoLink
      href={href}
      external={external}
      replace={replace}
      prefetch={prefetch}
      onPress={onPress}
      style={asWeb(style)}
      {...props}
    >
      {children}
    </HozoLink>
  )
}
// Both spellings, the way `TermList` reads both. The member keeps the
// full name rather than shortening to `Text`: a flat export has to be
// readable on its own, and a `<Text>` that meant the annotation would
// not be. The compiler recognises the pair in `hozo_parser`.
Ruby.RubyText = RubyText
