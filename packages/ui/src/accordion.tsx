/**
 * An accordion with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs: every header its own tab stop, the arrows that move
 * focus and change nothing else, the panel that stays in the document and is
 * `hidden` rather than removed so `aria-controls` points at something real.
 * This file draws a card, a row and a chevron.
 *
 * ## The chevron is drawn, and is never told which way to point
 *
 * A box with two borders, rotated, in the pattern's `indicator` slot. The
 * pattern hands it the state the header announces, so nothing here is passed
 * a boolean it could disagree with -- the same arrangement as `Radio` and
 * `Toggle` (#901). A chevron driven by an `open` prop of ours is a chevron
 * that is eventually wrong.
 *
 * It was `::after` until React Native showed no chevron at all, having no
 * pseudo-elements (#1205). The slot is a real node on both platforms, hidden
 * from assistive technology by the pattern: the state it draws is already on
 * the trigger as `aria-expanded`.
 *
 * ## A border per section rather than `divide-y`
 *
 * `divide-y` is one class on the container and would read better. It styles
 * children through a selector, which React Native has none of, and this
 * package's rule is that a class list works on both platforms or is a
 * deliberate exception. `border-t` with `first:border-t-0` asks about a
 * sibling's position instead, which the compiler can answer from the JSX tree
 * on Native -- see decision 003.
 */

import {
  type AccordionItem,
  Accordion as AccordionPattern,
  type AccordionProps,
} from '@hozo/patterns'

/**
 * The pattern's props without the four class lists this package owns.
 *
 * Distributed over the union on purpose: `Omit<A | B, K>` collapses the two
 * halves into one object and loses the `multiple` discriminant with them,
 * which would let `multiple: true` be given a `defaultExpanded` of a single
 * string. `T extends unknown ? …` keeps them apart.
 */
type Styled<T> = T extends unknown
  ? Omit<T, 'sectionClassName' | 'headingClassName' | 'triggerClassName' | 'panelClassName'>
  : never

export type HozoAccordionProps = Styled<AccordionProps>
export type { AccordionItem as HozoAccordionItem }

const shell = 'overflow-hidden rounded-hozo-surface border border-hozo-border bg-hozo-surface'

const section = 'border-t border-hozo-border-subtle first:border-t-0'

/** The `h1`–`h6` the caller chose, carrying no size of its own. */
const heading = 'm-0'

/**
 * One row. The chevron is the last three quarters of it.
 *
 * The geometry, derived rather than recalled, because it was wrong here first:
 * a box with only a bottom and a right border is an angle whose apex points
 * **south-east**, and CSS rotates clockwise. So `rotate-45` turns the apex
 * south -- a chevron pointing down, which is what a closed row shows -- and
 * `-rotate-135` turns it north for an open one. The first version of this file
 * said "`-rotate-45` points down" and drew a chevron pointing *right*, opening
 * to the *left*: a tree's idiom on an accordion, in code whose comment claimed
 * otherwise. Nothing caught it, because no automated check in this repository
 * looks at a shape.
 *
 * Both angles are the same property, so the transition runs between two values
 * rather than between a value and nothing.
 */
const trigger =
  'flex w-full flex-row items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-hozo-text cursor-pointer transition-colors hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-not-allowed disabled:text-hozo-text-subtle disabled:hover:bg-transparent'
const chevron =
  'size-2 shrink-0 rotate-45 border-b-2 border-r-2 border-hozo-text-muted transition-transform'
const chevronOpen =
  'size-2 shrink-0 -rotate-135 border-b-2 border-r-2 border-hozo-text-muted transition-transform'

const panel = 'px-4 pb-4 text-sm text-hozo-text-body'

export function HozoAccordion({ className, ...rest }: HozoAccordionProps) {
  return (
    <AccordionPattern
      // The cast is the price of the distributed type above: `rest` is a union
      // of two object types and JSX resolves a spread of one poorly. The
      // discriminant is intact in the props the caller writes, which is where
      // it is worth having.
      {...(rest as AccordionProps)}
      className={className ? `${shell} ${className}` : shell}
      sectionClassName={section}
      headingClassName={heading}
      triggerClassName={trigger}
      panelClassName={panel}
      indicator={({ expanded }) => ({ className: expanded ? chevronOpen : chevron })}
    />
  )
}

export { HozoAccordion as Accordion, type HozoAccordionProps as AccordionProps }
