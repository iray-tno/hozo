/**
 * A command palette with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is the pattern's: a dialog holding a combobox, grouped
 * results ranked as the query narrows them, the count announced, Enter to
 * run. This file puts the panel near the top of the screen, centred, over a
 * scrim, and fills the row the arrow keys are on through the pattern's
 * `activeItemClassName`, which reaches React Native as well.
 *
 * Near the top rather than centred vertically: the results grow downwards
 * as they are typed for, and a centred panel would move its own field.
 */

import { CommandPalette, type CommandPaletteProps, cx } from '@hozo/core'

export type HozoCommandPaletteProps = Omit<CommandPaletteProps, 'className' | 'scrimClassName'>

const root = 'fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4'
const scrim = 'absolute inset-0 bg-hozo-scrim/50'
const panel =
  'relative w-full max-w-xl overflow-hidden rounded-hozo-panel border border-hozo-border bg-hozo-surface text-sm text-hozo-text-body shadow-hozo-surface'
// The ring is inset: the panel clips its overflow for the rounded corners, so
// an outline outside the field would be cut off at the panel's edge.
const input =
  'w-full border-b border-hozo-border bg-transparent px-4 py-3 text-base text-hozo-text placeholder:text-hozo-text-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-hozo-focus'
const list = 'max-h-80 overflow-y-auto p-2'
const heading = 'px-2 pt-3 pb-1 text-xs font-medium text-hozo-text-subtle'
const item =
  'flex flex-row items-center justify-between rounded-hozo-control px-2 py-2 cursor-pointer'
const active = 'bg-hozo-accent-subtle text-hozo-accent-text'
// Muted, not subtle: the shortcut also sits on the active row's accent-subtle
// fill, where subtle measured 4.26:1 at 12px in light.
const shortcut = 'text-xs text-hozo-text-muted'
const empty = 'px-4 py-6 text-center text-hozo-text-subtle'

// Not named `HozoCommandPalette` here: compiled output imports a runtime
// component under that name for the `<CommandPalette>` below (#670).
function StyledCommandPalette({
  panelClassName,
  inputClassName,
  listClassName,
  groupHeadingClassName,
  itemClassName,
  activeItemClassName,
  shortcutClassName,
  emptyClassName,
  ...rest
}: HozoCommandPaletteProps) {
  return (
    <CommandPalette
      {...rest}
      className={root}
      scrimClassName={scrim}
      panelClassName={cx(panel, panelClassName)}
      inputClassName={cx(input, inputClassName)}
      listClassName={cx(list, listClassName)}
      groupHeadingClassName={cx(heading, groupHeadingClassName)}
      itemClassName={cx(item, itemClassName)}
      activeItemClassName={cx(active, activeItemClassName)}
      shortcutClassName={cx(shortcut, shortcutClassName)}
      emptyClassName={cx(empty, emptyClassName)}
    />
  )
}

export {
  type HozoCommandPaletteProps as CommandPaletteProps,
  StyledCommandPalette as CommandPalette,
  StyledCommandPalette as HozoCommandPalette,
}
