/**
 * A drawer with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs -- `Portal + FocusScope + DismissableLayer`, plus the
 * scroll lock #142 asks for by name and the gesture that lives only on the native
 * half. This file puts a panel against an edge.
 *
 * ## Two lists, not one list with the side interpolated
 *
 * `justify-start` and `justify-end`, and a border and a radius on the inner edge,
 * are four names that depend on a prop. They are written out per side and chosen
 * by a lookup, because Tailwind's scanner and Hozo's compiler both read class
 * names without running the code -- `justify-${side}` is a name neither can see,
 * so the CSS for it is never emitted. The repeated words are the price of the
 * class list being a literal, which is the same trade `Button`'s tones make.
 *
 * ## `w-80 max-w-[85vw]`
 *
 * A nav drawer wants a fixed width, because its contents are a list of links and
 * a list of links does not want to be as wide as a tablet. `max-w-[85vw]` is the
 * phone case: a 320px drawer on a 360px screen leaves 40px of scrim, which is not
 * enough of the page left showing to be worth calling a drawer.
 */

import { Drawer as DrawerPattern, type DrawerProps, useHozoDrawerSide } from '@hozo/patterns'

export type HozoDrawerProps = Omit<DrawerProps, 'className' | 'scrimClassName' | 'panelClassName'>

const ROOT: Record<'left' | 'right', string> = {
  left: 'fixed inset-0 z-50 flex justify-start',
  right: 'fixed inset-0 z-50 flex justify-end',
}

/** Dark in both schemes, because a scrim is not a surface seen from behind. */
const scrim =
  'absolute inset-0 bg-hozo-scrim/50 transition-opacity duration-200 ease-out starting:opacity-0 data-[state=closed]:opacity-0'

/**
 * The radius and the border are on the inner edge only -- the outer one is
 * against the viewport, where a rounded corner would show the page through it.
 */
const PANEL: Record<'left' | 'right', string> = {
  left: 'relative flex h-full w-80 max-w-[85vw] flex-col gap-4 overflow-y-auto rounded-r-hozo-panel border-r border-hozo-border bg-hozo-surface p-6 text-hozo-text-body shadow-hozo-surface transition duration-200 ease-out starting:opacity-0 data-[state=closed]:opacity-0 motion-safe:starting:-translate-x-full motion-safe:data-[state=closed]:-translate-x-full',
  right:
    'relative flex h-full w-80 max-w-[85vw] flex-col gap-4 overflow-y-auto rounded-l-hozo-panel border-l border-hozo-border bg-hozo-surface p-6 text-hozo-text-body shadow-hozo-surface transition duration-200 ease-out starting:opacity-0 data-[state=closed]:opacity-0 motion-safe:starting:translate-x-full motion-safe:data-[state=closed]:translate-x-full',
}

export function HozoDrawer({ side = 'left', ...rest }: HozoDrawerProps) {
  // Keyed by the edge it lands on, so `start` in a right-to-left interface
  // draws the right-hand look.
  const edge = useHozoDrawerSide(side)
  return (
    <DrawerPattern
      {...rest}
      side={side}
      className={ROOT[edge]}
      scrimClassName={scrim}
      panelClassName={PANEL[edge]}
    />
  )
}

export { HozoDrawer as Drawer, type HozoDrawerProps as DrawerProps }
