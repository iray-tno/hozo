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

import { CommandPalette, type CommandPaletteProps } from '@hozo/core'

export type HozoCommandPaletteProps = Omit<CommandPaletteProps, 'className' | 'scrimClassName'>

const root = 'fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4'
const scrim = 'absolute inset-0 bg-hozo-scrim/50'
const panel =
  'relative w-full max-w-xl overflow-hidden rounded-hozo-panel border border-hozo-border bg-hozo-surface text-sm text-hozo-text-body shadow-hozo-surface'
const input =
  'w-full border-b border-hozo-border bg-transparent px-4 py-3 text-base text-hozo-text placeholder:text-hozo-text-subtle'
const list = 'max-h-80 overflow-y-auto p-2'
const heading = 'px-2 pt-3 pb-1 text-xs font-medium text-hozo-text-subtle'
const item =
  'flex flex-row items-center justify-between rounded-hozo-control px-2 py-2 cursor-pointer'
const active = 'bg-hozo-accent-subtle text-hozo-accent-text'
const shortcut = 'text-xs text-hozo-text-subtle'
const empty = 'px-4 py-6 text-center text-hozo-text-subtle'

const plus = (own: string, extra: string | undefined) => (extra ? `${own} ${extra}` : own)

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
      panelClassName={plus(panel, panelClassName)}
      inputClassName={plus(input, inputClassName)}
      listClassName={plus(list, listClassName)}
      groupHeadingClassName={plus(heading, groupHeadingClassName)}
      itemClassName={plus(item, itemClassName)}
      activeItemClassName={plus(active, activeItemClassName)}
      shortcutClassName={plus(shortcut, shortcutClassName)}
      emptyClassName={plus(empty, emptyClassName)}
    />
  )
}

export {
  type HozoCommandPaletteProps as CommandPaletteProps,
  StyledCommandPalette as CommandPalette,
  StyledCommandPalette as HozoCommandPalette,
}
