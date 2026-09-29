/**
 * A tooltip with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs and there is a lot of it: the warm-up delay shared
 * across a toolbar's siblings, the safe polygon between trigger and bubble,
 * `aria-describedby` wired to the trigger, dismissal, and the floating
 * positioner's flip and shift. This file gives it a background.
 *
 * ## It is the positioner that gets the class list
 *
 * The pattern puts `className` on the floating element and leaves the inner
 * `role="tooltip"` div bare, which is the right way round for this: the
 * positioner is the box, and the element with the role is a label inside it.
 * So the padding and the background go here, and nothing this package writes
 * lands on the element a reader reads.
 *
 * ## Inverse, which is the one place a reversed pair is correct
 *
 * `bg-hozo-surface-inverse` with `text-hozo-text-inverse`: dark on a light
 * page, light on a dark one. A tooltip is meant to read as *not* part of the
 * page, and both tokens flip together, so the pair stays legible in either
 * scheme without either component knowing which one it is in.
 *
 * `max-w-xs`, because a tooltip is a phrase. One that wraps to five lines is a
 * paragraph that should have been on the page, and the width is what stops
 * that being invisible while writing it.
 */

import { Tooltip as TooltipPattern, type TooltipProps } from '@hozo/patterns'

export type HozoTooltipProps = TooltipProps

const bubble =
  'max-w-xs rounded-hozo-control bg-hozo-surface-inverse px-2 py-1 text-xs text-hozo-text-inverse shadow-hozo-surface'

export function HozoTooltip({ className, ...rest }: HozoTooltipProps) {
  return <TooltipPattern {...rest} className={className ? `${bubble} ${className}` : bubble} />
}

export { HozoTooltip as Tooltip, type HozoTooltipProps as TooltipProps }
