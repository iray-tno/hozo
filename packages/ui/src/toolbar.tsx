/**
 * A toolbar with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs: one tab stop for the bar with the arrows moving
 * along it, skipping the disabled, optionally wrapping, and flipping with the
 * document's direction. This file draws the bar.
 *
 * ## The shortest component here, and the only one that styles nothing inside
 *
 * A toolbar's items are rendered by the caller through `items[].render`, which
 * hands each one the `tabIndex`, `ref` and handlers that make the roving focus
 * work. So there is no inner element for this package to reach, and putting the
 * controls in is the caller's job -- `Button tone="quiet"` is what the story
 * uses.
 *
 * That is the composition #638 §2 is about, from the other side: a `Toolbar`
 * that drew its own buttons would be deciding what a toolbar contains, and the
 * pattern deliberately does not.
 */

import { Toolbar as ToolbarPattern, type ToolbarProps } from '@hozo/patterns'

export type HozoToolbarProps = ToolbarProps
export type { ToolbarItem as HozoToolbarItem } from '@hozo/patterns'

const HORIZONTAL =
  'flex flex-row flex-wrap items-center gap-1 rounded-hozo-surface border border-hozo-border bg-hozo-surface p-1'
const VERTICAL =
  'flex flex-col items-stretch gap-1 rounded-hozo-surface border border-hozo-border bg-hozo-surface p-1'

export function HozoToolbar({ className, orientation, ...rest }: HozoToolbarProps) {
  const own = orientation === 'vertical' ? VERTICAL : HORIZONTAL
  return (
    <ToolbarPattern
      {...rest}
      orientation={orientation}
      className={className ? `${own} ${className}` : own}
    />
  )
}

export { HozoToolbar as Toolbar, type HozoToolbarProps as ToolbarProps }
