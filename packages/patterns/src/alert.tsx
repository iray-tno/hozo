/**
 * A message that may be announced when it appears or changes.
 *
 * WAI-ARIA's alert pattern, with the urgency a prop: `assertive` is
 * `role="alert"`, `polite` is `role="status"`, and `false` is neither. The
 * two roles carry their own urgency, so `aria-live` would repeat it -- and a
 * reader given both has been told the same thing twice and may believe the
 * quieter one.
 *
 * It is here rather than in `@hozo/ui` because announcing differs per
 * platform (#983). `alert.native.tsx` is the other half. The look is the
 * caller's, through `className`.
 */

import type { ReactNode } from 'react'

export type HozoAlertLive = 'polite' | 'assertive' | false

export interface HozoAlertProps {
  children?: ReactNode
  /** Whether, and how urgently, a change is announced. Not at all by default. */
  live?: HozoAlertLive
  className?: string
}

export function HozoAlert({ children, live = false, className }: HozoAlertProps) {
  return (
    <div
      role={live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined}
      className={className}
    >
      {children}
    </div>
  )
}

export { HozoAlert as Alert, type HozoAlertLive as AlertLive, type HozoAlertProps as AlertProps }
