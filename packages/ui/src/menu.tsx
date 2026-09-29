/**
 * A menu with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs and there is more of it than the markup suggests: the
 * trigger's `aria-haspopup` and `aria-expanded`, opening on Enter, Space, Down
 * and Up with focus landing on the first or last item accordingly, the roving
 * tab stops inside, dismissal, and the floating positioner that flips the panel
 * when it would leave the viewport. This file draws a button and a panel.
 *
 * ## The trigger's class list is the neutral `Button`'s, written out again
 *
 * Not imported from `button.tsx`, and not shared through a constant, because
 * the pattern's trigger is a plain `<button>` while `Button` is the primitive --
 * two elements with two lowerings. A shared string would make them look like
 * one thing that can be changed in one place, and the first `disabled:` added
 * to it would compile to `[data-hozo-disabled]` and style the primitive while
 * doing nothing here.
 *
 * So they are two literals that happen to match, which is also what Tailwind's
 * scanner and Hozo's compiler need: a complete class name they can read without
 * running anything.
 *
 * ## `z-50` is already on the positioner
 *
 * The pattern puts it there, so the panel's list carries none -- a second
 * z-index on the inner box would be a number nobody can reason about against
 * the first.
 */

import { Menu as MenuPattern, type MenuProps } from '@hozo/patterns'

export type HozoMenuProps = Omit<MenuProps, 'triggerClassName' | 'menuClassName' | 'itemClassName'>
export type { MenuItem as HozoMenuItem } from '@hozo/patterns'

const trigger =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-hozo-control transition-colors cursor-pointer bg-hozo-surface text-hozo-text-body border border-hozo-border-strong hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'

const panel =
  'flex flex-col gap-0.5 min-w-40 rounded-hozo-surface border border-hozo-border bg-hozo-surface p-1 shadow-hozo-surface'

const item =
  'cursor-pointer rounded-hozo-control px-3 py-1.5 text-start text-sm text-hozo-text hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent'

export function HozoMenu({ className, ...rest }: HozoMenuProps) {
  return (
    <MenuPattern
      {...rest}
      className={className}
      triggerClassName={trigger}
      menuClassName={panel}
      itemClassName={item}
    />
  )
}

export { HozoMenu as Menu, type HozoMenuProps as MenuProps }
