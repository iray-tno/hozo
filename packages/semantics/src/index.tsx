import { useHozoMessage } from '@hozo/behaviors'
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

export interface ListProps extends SemanticsUniversalProps {
  ordered?: boolean
}

export function List({ ordered = false, className, children, style, ...props }: ListProps) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className={className} style={style} {...domProps(props)}>
      {children}
    </Tag>
  )
}

export function ListItem({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <li className={className} style={style} {...domProps(props)}>
      {children}
    </li>
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

export function Term({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <dt className={className} style={style} {...domProps(props)}>
      {children}
    </dt>
  )
}

export function Description({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <dd className={className} style={style} {...domProps(props)}>
      {children}
    </dd>
  )
}

export function TermList({ className, children, style, ...props }: SemanticsUniversalProps) {
  return (
    <dl className={className} style={style} {...domProps(props)}>
      {children}
    </dl>
  )
}

TermList.Term = Term
TermList.Description = Description

export interface SeparatorProps extends SemanticsUniversalProps {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

export function Separator({
  className,
  style,
  orientation = 'horizontal',
  decorative = false,
  role,
  ...props
}: SeparatorProps) {
  const dom = domProps(props)
  return (
    <hr
      className={className}
      style={style}
      aria-orientation={orientation === 'vertical' ? 'vertical' : undefined}
      {...dom}
      role={role ?? (decorative ? 'none' : 'separator')}
      aria-hidden={decorative ? true : dom['aria-hidden']}
    />
  )
}

export interface ProgressProps extends SemanticsUniversalProps {
  value?: number
  max?: number
  children?: ReactNode
}

export interface BadgeProps extends SemanticsUniversalProps {
  /**
   * A number to show. With it, the badge reads as its `accessibilityLabel`
   * ("3 unread messages") rather than as the bare digit; without one, the
   * children are the badge, a word that already says what it means.
   */
  count?: number
  /** The largest number shown; above it the badge shows `99+`. */
  max?: number
  children?: ReactNode
}

/** Off screen and still in the accessibility tree. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

/**
 * A short status label -- "Draft", or a count.
 *
 * A count is the case with something to get right. The digit alone is read
 * as "three", which says nothing about what there are three of, and a
 * `<span>` cannot carry an accessible name to say it instead: `generic` is
 * one of the roles ARIA prohibits naming. So the digit is hidden from
 * assistive technology and the sentence is beside it, off screen -- the
 * same arrangement a screen reader would hear from `"3" + " unread messages"`
 * written out, with only the first part drawn.
 */
export function Badge({ count, max, className, style, children, ...props }: BadgeProps) {
  const message = useHozoMessage()
  const { 'aria-label': named, ...dom } = domProps(props)
  if (count === undefined) {
    return (
      <span className={className} style={style} aria-label={named} {...dom}>
        {children}
      </span>
    )
  }
  const over = max !== undefined && count > max
  const shown = over ? `${max}+` : String(count)
  const label = named ?? (over ? message('hozo.badge.overflow', { max: max as number }) : shown)
  return (
    <span className={className} style={style} {...dom}>
      <span aria-hidden="true">{shown}</span>
      <span style={VISUALLY_HIDDEN}>{label}</span>
    </span>
  )
}

export interface SkeletonProps extends SemanticsUniversalProps {
  children?: ReactNode
}

/**
 * A loading placeholder.
 *
 * Hidden from assistive technology, because a grey box has nothing to say;
 * the region being loaded is what says so, with `aria-busy`. Marked with
 * `data-hozo-skeleton`, so the compiler's base CSS stops any animation on it
 * or inside it under reduced motion -- whatever class started it
 * (decision 007, section 5). The look, pulse included, is the caller's.
 */
export function Skeleton({ className, style, children, ...props }: SkeletonProps) {
  return (
    <div
      className={className}
      style={style}
      {...domProps(props)}
      aria-hidden={true}
      data-hozo-skeleton=""
    >
      {children}
    </div>
  )
}

export interface MeterProps extends SemanticsUniversalProps {
  /** Where in the range the amount is. */
  value: number
  /** The range, 0 to 1 when left out, as `<meter>` reads it. */
  min?: number
  max?: number
  /**
   * Where the range counts as low, high and best. The browser colours the
   * bar by them; nothing announces them, on either platform.
   */
  low?: number
  high?: number
  optimum?: number
  children?: ReactNode
}

/**
 * An amount within a known range -- a disk's fill, a password's strength.
 * Not `Progress`, which is how far a task has got: a reader says "meter"
 * for this and "progress bar" for that, and they mean different things.
 */
export function Meter({
  value,
  min,
  max,
  low,
  high,
  optimum,
  className,
  children,
  style,
  ...props
}: MeterProps) {
  return (
    <meter
      value={value}
      min={min}
      max={max}
      low={low}
      high={high}
      optimum={optimum}
      className={className}
      style={style}
      {...domProps(props)}
    >
      {children}
    </meter>
  )
}

export function Progress({ value, max, className, children, style, ...props }: ProgressProps) {
  return (
    <progress value={value} max={max} className={className} style={style} {...domProps(props)}>
      {children ?? (value != null ? `${value}%` : undefined)}
    </progress>
  )
}
