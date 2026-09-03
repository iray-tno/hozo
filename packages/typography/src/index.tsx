import type { CSSProperties, ReactNode } from 'react'

export interface TypographyUniversalProps {
  className?: string
  children?: ReactNode
  style?: CSSProperties
  testID?: string
  nativeID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  'aria-hidden'?: boolean
}

export type TextProps = TypographyUniversalProps
export type SemanticTextProps = TypographyUniversalProps

export interface HeadingProps extends TypographyUniversalProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6
}

function domProps(props: Omit<TypographyUniversalProps, 'style' | 'className' | 'children'>) {
  return {
    'data-testid': props.testID,
    id: props.nativeID,
    'aria-label': props.accessibilityLabel,
    'aria-description': props.accessibilityHint,
    'aria-hidden': props['aria-hidden'],
  }
}

export function Text({ className, children, style, ...props }: TextProps) {
  return (
    <span className={className} style={style} {...domProps(props)}>
      {children}
    </span>
  )
}

export function Paragraph({ className, children, style, ...props }: SemanticTextProps) {
  return (
    <p className={className} style={style} {...domProps(props)}>
      {children}
    </p>
  )
}

export function Heading({ level = 1, className, children, style, ...props }: HeadingProps) {
  const Tag = `h${Math.min(6, Math.max(1, level))}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  return (
    <Tag className={className} style={style} {...domProps(props)}>
      {children}
    </Tag>
  )
}

export function Strong({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <strong className={className} style={style} {...domProps(props)}>
      {children}
    </strong>
  )
}

export function Emphasis({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <em className={className} style={style} {...domProps(props)}>
      {children}
    </em>
  )
}

export function Underline({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <u className={className} style={style} {...domProps(props)}>
      {children}
    </u>
  )
}

export function Strikethrough({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <s className={className} style={style} {...domProps(props)}>
      {children}
    </s>
  )
}

export const Del = Strikethrough

export function Sub({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <sub className={className} style={style} {...domProps(props)}>
      {children}
    </sub>
  )
}

export function Sup({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <sup className={className} style={style} {...domProps(props)}>
      {children}
    </sup>
  )
}

export function Code({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <code className={className} style={style} {...domProps(props)}>
      {children}
    </code>
  )
}

export function Small({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <small className={className} style={style} {...domProps(props)}>
      {children}
    </small>
  )
}

export function Mark({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <mark className={className} style={style} {...domProps(props)}>
      {children}
    </mark>
  )
}

export function NoBreak({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <span className={className} style={{ whiteSpace: 'nowrap', ...style }} {...domProps(props)}>
      {children}
    </span>
  )
}

export function Ruby({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <ruby className={className} style={style} {...domProps(props)}>
      {children}
    </ruby>
  )
}

export function Rt({ className, children, style, ...props }: TypographyUniversalProps) {
  return (
    <rt className={className} style={style} {...domProps(props)}>
      {children}
    </rt>
  )
}

export interface LinkProps extends TypographyUniversalProps {
  href: string
  target?: '_blank' | '_self' | '_parent' | '_top' | string
  rel?: string
  download?: boolean | string
  external?: boolean
  onPress?: (event: React.MouseEvent<HTMLAnchorElement>) => void
}

export function Link({
  href,
  target,
  rel,
  download,
  external,
  className,
  children,
  style,
  onPress,
  ...props
}: LinkProps) {
  const finalTarget = external ? '_blank' : target
  const finalRel = external || target === '_blank' ? (rel ?? 'noreferrer noopener') : rel
  return (
    <a
      href={href}
      target={finalTarget}
      rel={finalRel}
      download={download}
      onClick={onPress}
      className={className}
      style={style}
      {...domProps(props)}
    >
      {children}
    </a>
  )
}
