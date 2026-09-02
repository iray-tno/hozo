import React, { type ReactNode } from 'react'

export interface TypographyNativeProps {
  children?: ReactNode
  style?: any
  testID?: string
  nativeID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityRole?: string
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
  return React.createElement('Text', { style, ...props }, children)
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
  return <Text style={style} {...props} />
}

export function Sup({ style, ...props }: TypographyNativeProps) {
  return <Text style={style} {...props} />
}

export function Code({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ fontFamily: 'monospace' }, style]} {...props} />
}

export function Small({ style, ...props }: TypographyNativeProps) {
  return <Text style={[{ fontSize: '0.85em', opacity: 0.8 }, style]} {...props} />
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
      style={[{ fontSize: '0.65em', opacity: 0.85 }, style]}
      accessible={false}
      aria-hidden={true}
      {...props}
    />
  )
}
