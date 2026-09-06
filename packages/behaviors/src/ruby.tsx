// The Web half of ruby, which the browser already is.
//
// `<ruby>` and `<rt>` are elements a browser lays out and announces, so
// the Web backend lowers straight to them and nothing here is on the
// compiled path. It exists for the reason `disclosure.tsx` does: a
// package resolves this one's types through the Web entry whichever
// platform it builds for, so a component the Native backend emits has to
// be nameable here.

import type { CSSProperties, ReactNode } from 'react'

export interface HozoRubyProps {
  children?: ReactNode
  accessibilityLabel?: string
  className?: string
  style?: CSSProperties
  testID?: string
}

export interface HozoRubyTextProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  testID?: string
}

export function HozoRuby({
  children,
  accessibilityLabel,
  className,
  style,
  testID,
}: HozoRubyProps) {
  return (
    <ruby className={className} style={style} data-testid={testID} aria-label={accessibilityLabel}>
      {children}
    </ruby>
  )
}

export function HozoRubyText({ children, className, style, testID }: HozoRubyTextProps) {
  return (
    <rt className={className} style={style} data-testid={testID}>
      {children}
    </rt>
  )
}
