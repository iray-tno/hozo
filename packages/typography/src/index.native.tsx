import React, { type ReactNode } from 'react'
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
  type TextStyle,
} from 'react-native'

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

// Minimal fallback helper when running uncompiled on Native
export function Text({ children, style, ...props }: TextProps) {
  return React.createElement(RNText, { style, ...props }, children)
}

export function Paragraph(props: SemanticTextProps) {
  return <Text {...props} />
}

export function Heading({ level = 1, accessibilityRole = 'header', ...props }: HeadingProps) {
  return <Text accessibilityRole={accessibilityRole} {...props} />
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
  return <Text style={[{ fontSize: 11 }, style]} {...props} />
}

export function Sup({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ fontSize: 11 }, style]} {...props} />
}

export function Code({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ fontFamily: 'monospace' }, style]} {...props} />
}

export function Small({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ fontSize: 12, opacity: 0.8 }, style]} {...props} />
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

export function Rt({ style, ...props }: TypographyNativeProps) {
  return (
    <Text
      // `0.65em` was here, and React Native has no relative font units:
      // its `fontSize` is a number of points. The value was ignored, so
      // ruby text has always drawn at the base size on this platform. The
      // lie is gone; the sizing needs a base to scale from and is #226.
      style={[{ opacity: 0.85 }, style]}
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
