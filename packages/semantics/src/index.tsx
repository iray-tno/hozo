import type { CSSProperties, ReactNode } from 'react'

export interface SemanticsUniversalProps {
  className?: string
  children?: ReactNode
  style?: CSSProperties
  testID?: string
  nativeID?: string
  role?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  'aria-hidden'?: boolean
  'aria-label'?: string
}

export interface TimeProps extends SemanticsUniversalProps {
  dateTime?: string
  datetime?: string
}

function domProps(props: Omit<SemanticsUniversalProps, 'style' | 'className' | 'children'>) {
  return {
    'data-testid': props.testID,
    id: props.nativeID,
    role: props.role,
    'aria-label': props['aria-label'] ?? props.accessibilityLabel,
    'aria-description': props.accessibilityHint,
    'aria-hidden': props['aria-hidden'],
  }
}

export function Main({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <main className={className} style={style} {...domProps(props)}>
      {children}
    </main>
  )
}

export function Header({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <header className={className} style={style} {...domProps(props)}>
      {children}
    </header>
  )
}

export function Footer({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <footer className={className} style={style} {...domProps(props)}>
      {children}
    </footer>
  )
}

export function Aside({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <aside className={className} style={style} {...domProps(props)}>
      {children}
    </aside>
  )
}

export function Search({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <search className={className} style={style} {...domProps(props)}>
      {children}
    </search>
  )
}

export function Section({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <section className={className} style={style} {...domProps(props)}>
      {children}
    </section>
  )
}

export function Article({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <article className={className} style={style} {...domProps(props)}>
      {children}
    </article>
  )
}

export function Nav({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <nav className={className} style={style} {...domProps(props)}>
      {children}
    </nav>
  )
}

export function Figure({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <figure className={className} style={style} {...domProps(props)}>
      {children}
    </figure>
  )
}

export function Figcaption({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <figcaption className={className} style={style} {...domProps(props)}>
      {children}
    </figcaption>
  )
}

export function Time({ className, children, style, dateTime, datetime, ...props }: TimeProps) {
  return (
    <time className={className} style={style} dateTime={dateTime ?? datetime} {...domProps(props)}>
      {children}
    </time>
  )
}

export function Address({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <address className={className} style={style} {...domProps(props)}>
      {children}
    </address>
  )
}

export function Fieldset({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <fieldset className={className} style={style} {...domProps(props)}>
      {children}
    </fieldset>
  )
}

export function Legend({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <legend className={className} style={style} {...domProps(props)}>
      {children}
    </legend>
  )
}

export interface DetailsProps extends SemanticsUniversalProps {
  open?: boolean
}

export function Details({ className, children, style, open, ...props }: DetailsProps) {
  return (
    <details className={className} style={style} open={open} {...domProps(props)}>
      {children}
    </details>
  )
}

export function Summary({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <summary className={className} style={style} {...domProps(props)}>
      {children}
    </summary>
  )
}

export function Dl({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <dl className={className} style={style} {...domProps(props)}>
      {children}
    </dl>
  )
}

export function Dt({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <dt className={className} style={style} {...domProps(props)}>
      {children}
    </dt>
  )
}

export function Dd({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <dd className={className} style={style} {...domProps(props)}>
      {children}
    </dd>
  )
}
