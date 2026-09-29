/**
 * A badge and an alert: a word with a colour, and a sentence with a role.
 *
 * `Badge` is entirely a look and belongs here for that reason. It is a
 * `<span>` with no role, because a coloured word is decoration around text
 * that says the same thing -- a badge reading "Draft" beside a title a reader
 * has already heard adds nothing, and a badge whose colour is the only thing
 * saying "error" is a badge a colour-blind reader cannot read either. The
 * word carries the meaning; the colour repeats it.
 *
 * `Alert` is the one line of semantics in this package, and it is a role
 * rather than behaviour: `role="status"` for something that appeared,
 * `role="alert"` for something that went wrong. Both are live regions, and
 * the difference is whether a reader interrupts itself to say it. That is a
 * decision about urgency, which is the caller's, so it is a prop.
 *
 * An alert rendered with the page rather than in response to something is
 * announced on load, which is right for "your session expired" and wrong for
 * a decorative notice. The caller who wants the second one wants `tone`
 * without `live`, and can say so.
 */

import type { ReactNode } from 'react'

export type HozoStatusTone = 'neutral' | 'accent' | 'danger'

export interface HozoBadgeProps {
  children?: ReactNode
  tone?: HozoStatusTone
  className?: string
}

export interface HozoAlertProps {
  children?: ReactNode
  tone?: HozoStatusTone
  /**
   * Whether a reader announces it when it appears.
   *
   * `'polite'` waits for a pause, `'assertive'` interrupts, and `false` --
   * the default -- is a box that is simply on the page. Defaulting to silence
   * because an alert rendered with the page announces on load, and a notice
   * that does that on every visit is one people turn the reader off for.
   */
  live?: 'polite' | 'assertive' | false
  className?: string
}

const badgeNeutral =
  'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-hozo-surface-raised text-hozo-text-body'
const badgeAccent =
  'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-hozo-accent-subtle text-hozo-accent-text'
const badgeDanger =
  'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-hozo-danger-subtle text-hozo-danger-text'

const alertNeutral =
  'rounded-hozo-surface border px-4 py-3 text-sm border-hozo-border bg-hozo-surface-sunken text-hozo-text-body'
const alertAccent =
  'rounded-hozo-surface border px-4 py-3 text-sm border-hozo-accent bg-hozo-accent-subtle text-hozo-accent-text'
const alertDanger =
  'rounded-hozo-surface border px-4 py-3 text-sm border-hozo-danger bg-hozo-danger-subtle text-hozo-danger-text'

export function HozoBadge({ children, tone = 'neutral', className }: HozoBadgeProps) {
  const own = tone === 'accent' ? badgeAccent : tone === 'danger' ? badgeDanger : badgeNeutral
  return <span className={className ? `${own} ${className}` : own}>{children}</span>
}

export function HozoAlert({ children, tone = 'neutral', live = false, className }: HozoAlertProps) {
  const own = tone === 'accent' ? alertAccent : tone === 'danger' ? alertDanger : alertNeutral
  return (
    <div
      // `alert` is assertive by definition and `status` is polite, so the two
      // roles carry the urgency and `aria-live` would repeat it. A reader
      // given both has been told the same thing twice and may believe the
      // quieter one.
      role={live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined}
      className={className ? `${own} ${className}` : own}
    >
      {children}
    </div>
  )
}

export {
  HozoAlert as Alert,
  type HozoAlertProps as AlertProps,
  HozoBadge as Badge,
  type HozoBadgeProps as BadgeProps,
  type HozoStatusTone as StatusTone,
}
