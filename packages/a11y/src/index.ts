// Accessibility behaviour that can only exist at runtime (proposal §10.3):
// focus, keyboard, and the modal semantics a compiler can't decide.
//
// The rules Hozo actually decides live in `./focus.ts`, free of `react`
// and `document` so they can be tested. Everything else is delegated to the
// platform -- see `./dialog.tsx` for why that is the design and not a
// shortcut.

export { initialFocusIndex, shouldRestoreFocus, type FocusCandidate } from './focus.ts'
export { nextIndex, tabStops, type Orientation, type RovingKey, type RovingOptions } from './roving.ts'
export {
  isTypeaheadKey,
  nextSearch,
  searchIndex,
  TYPEAHEAD_TIMEOUT_MS,
  type TypeaheadOptions,
} from './typeahead.ts'
export { HozoDialog, type HozoDialogProps } from './dialog.tsx'
export { HozoTabs, type HozoTabsProps, type HozoTab } from './tabs.tsx'
export { HozoMenu, type HozoMenuProps, type HozoMenuItem } from './menu.tsx'
export {
  HozoToolbar,
  type HozoToolbarProps,
  type HozoToolbarItem,
  type HozoToolbarItemProps,
} from './toolbar.tsx'
export { HozoRadioGroup, type HozoRadioGroupProps, type HozoRadioOption } from './radio.tsx'
export {
  HozoListbox,
  type HozoListboxProps,
  type HozoListboxOption,
  type HozoListboxSingleProps,
  type HozoListboxMultipleProps,
} from './listbox.tsx'
export { horizontalMove, visibleRows, type TreeNode, type TreeRow, type TreeMove } from './tree.ts'
export { HozoTree, type HozoTreeProps } from './treeview.tsx'
export {
  activeAfter,
  filterOptions,
  inlineCompletion,
  type Autocomplete,
  type Completion,
  type FilterOptions,
} from './combobox.ts'
export { HozoCombobox, type HozoComboboxProps, type HozoComboboxOption } from './combo.tsx'
