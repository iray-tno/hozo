/**
 * A surface with a border, a radius and a shadow. Nothing else.
 *
 * It belongs in this package rather than in `@hozo/patterns` because it is
 * entirely a look: there is no role, no state and no keyboard contract to get
 * right, which is the test #638 §2 sets for what may live here.
 *
 * A `<div>` and not a `<section>`. A section without a name is a section a
 * reader announces and cannot say anything about, so the semantics are the
 * caller's to add -- `@hozo/semantics` has `Section`, and wrapping one in a
 * `Card` is the composition this package is for.
 */

import type { ReactNode } from 'react'

export interface HozoCardProps {
  children?: ReactNode
  /** Flat, for a card inside another surface where a shadow reads as dirt. */
  flat?: boolean
  className?: string
}

const raised =
  'rounded-hozo-panel border border-hozo-border bg-hozo-surface p-6 shadow-hozo-surface'
const level = 'rounded-hozo-panel border border-hozo-border bg-hozo-surface p-6'

export function HozoCard({ children, flat, className }: HozoCardProps) {
  const own = flat ? level : raised
  return <div className={className ? `${own} ${className}` : own}>{children}</div>
}

export { HozoCard as Card, type HozoCardProps as CardProps }
