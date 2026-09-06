// The Web half of the disclosure, which the browser already is.
//
// `<details>` opens and closes itself, hides everything but the
// `<summary>` while closed, and reports the expanded state to assistive
// technology without being asked. The compiler lowers `<Details>`
// straight to the element, so nothing here is on the compiled path.
//
// It exists for two reasons. `@hozo/semantics` renders the same pair
// uncompiled and should render one implementation rather than two; and a
// package resolves this one's types through the Web entry whichever
// platform it builds for, so a component the Native backend emits has to
// be nameable here or `@hozo/runtime` cannot re-export it.

import type { CSSProperties, ReactNode } from 'react'

export interface HozoDetailsProps {
  children?: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onToggle?: (open: boolean) => void
  className?: string
  style?: CSSProperties
  testID?: string
  accessibilityLabel?: string
}

export interface HozoSummaryProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  testID?: string
  accessibilityLabel?: string
}

export function HozoDetails({
  children,
  open,
  defaultOpen,
  onToggle,
  className,
  style,
  testID,
  accessibilityLabel,
}: HozoDetailsProps) {
  return (
    <details
      className={className}
      style={style}
      // `open` is the DOM's own attribute and takes both roles: controlled
      // when given, and the initial state when only `defaultOpen` is.
      open={open ?? defaultOpen}
      onToggle={(event) => onToggle?.((event.currentTarget as HTMLDetailsElement).open)}
      data-testid={testID}
      aria-label={accessibilityLabel}
    >
      {children}
    </details>
  )
}

export function HozoSummary({
  children,
  className,
  style,
  testID,
  accessibilityLabel,
}: HozoSummaryProps) {
  return (
    <summary
      className={className}
      style={style}
      data-testid={testID}
      aria-label={accessibilityLabel}
    >
      {children}
    </summary>
  )
}
