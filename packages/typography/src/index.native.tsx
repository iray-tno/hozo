import React, { createContext, type ReactNode, useContext } from 'react'
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
  Linking,
  Pressable,
  Text as RNText,
  type StyleProp,
  StyleSheet,
  type TextStyle,
} from 'react-native'
import { TEXT_SIZE_RATIOS } from './text-size.ts'

export { TEXT_SIZE_RATIOS } from './text-size.ts'

export interface TypographyNativeProps {
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
 * React Native offers nothing for this. Its `fontSize` is a number of
 * points with no relative unit, a nested `Text` inherits visually but
 * cannot read what it inherited, and the only ancestor context the
 * platform exposes -- `TextAncestorContext` -- is a boolean saying
 * whether there is a `Text` above at all.
 *
 * So Hozo carries it. `Text` publishes the size it was given, and the
 * components below scale against it. The default is React Native's own:
 * `RCTFont.mm` reads `const CGFloat defaultFontSize = 14`, and the
 * constants this replaces -- 11, 11, 12 -- are exactly the ratios above
 * applied to it.
 *
 * The limit is a plain React Native `<Text>` in between: it sets a size
 * this cannot see, so the scaling is against 14 rather than against what
 * is on screen. The compiled path has the same shape and a wider reach --
 * it follows the size through Views as well, which React Native itself
 * does not.
 */
const TextSize = createContext(14)

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
  // Bold and sized by level, which is what h1...h6 get from the UA
  // stylesheet on the Web and got from nothing at all here.
  const base = useContext(TextSize)
  const ratio = TEXT_SIZE_RATIOS.heading[Math.min(6, Math.max(1, level)) - 1] as number
  return (
    <Text
      accessibilityRole={accessibilityRole}
      style={[{ fontSize: relative(ratio, base), fontWeight: 'bold' }, style]}
      {...props}
    />
  )
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
  return <Text style={[{ fontSize: relative(TEXT_SIZE_RATIOS.sub, base) }, style]} {...props} />
}

export function Sup({ style, ...props }: TypographyNativeProps) {
  const base = useContext(TextSize)
  return <Text style={[{ fontSize: relative(TEXT_SIZE_RATIOS.sup, base) }, style]} {...props} />
}

export function Code({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ fontFamily: 'monospace' }, style]} {...props} />
}

export function Small({ style, ...props }: TypographyNativeProps) {
  const base = useContext(TextSize)
  return (
    <Text
      style={[{ fontSize: relative(TEXT_SIZE_RATIOS.small, base), opacity: 0.8 }, style]}
      {...props}
    />
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
    const element = node as React.ReactElement<any>
    if (element.props && element.props.children) {
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

export function Ruby({ children, accessibilityLabel, ...props }: TypographyNativeProps) {
  return (
    <Text
      accessible={accessibilityLabel != null}
      accessibilityLabel={accessibilityLabel}
      {...props}
    >
      {children}
    </Text>
  )
}

export function RubyText({ style, ...props }: TypographyNativeProps) {
  // `fontSize: '0.65em'` was here, which React Native ignored -- so ruby
  // drew at the size of the text it annotates. Half, now, against the size
  // `Text` published.
  const base = useContext(TextSize)
  return (
    <Text
      style={[{ fontSize: relative(TEXT_SIZE_RATIOS.rubyText, base), opacity: 0.85 }, style]}
      accessible={false}
      aria-hidden={true}
      {...props}
    />
  )
}

export interface LinkProps extends TypographyNativeProps {
  href: string
  external?: boolean
  target?: string
  rel?: string
  download?: boolean | string
  onPress?: (event: { defaultPrevented?: boolean }) => void
}

export function Link({ href, onPress, children, ...props }: LinkProps) {
  return React.createElement(
    Pressable,
    {
      accessibilityRole: 'link',
      onPress: (event: { defaultPrevented?: boolean }) => {
        onPress?.(event)
        // `Linking` imported rather than read off `globalThis`, where React Native
        // has never put it. The lookup always returned `undefined` and the
        // `if` around it always failed, so this did nothing at all -- silently,
        // which is the worst way for an accessibility affordance to be absent.
        if (!event?.defaultPrevented) void Linking.openURL(href)
      },
      ...props,
    },
    typeof children === 'string'
      ? React.createElement(RNText, { accessibilityRole: 'link' }, children)
      : children,
  )
}

// Both spellings, the way `TermList` reads both. The member keeps the
// full name rather than shortening to `Text`: a flat export has to be
// readable on its own, and a `<Text>` that meant the annotation would
// not be. The compiler recognises the pair in `hozo_parser`.
Ruby.RubyText = RubyText
