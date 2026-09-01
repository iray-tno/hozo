// Accessibility behaviour that can only exist at runtime (proposal §10.3):
// focus, keyboard, and the modal semantics a compiler can't decide.
//
// The rules Hozo actually decides live in `./focus.ts`, free of `react`
// and `document` so they can be tested. Everything else is delegated to the
// platform -- see `./dialog.tsx` for why that is the design and not a
// shortcut.

export { HozoCombobox, type HozoComboboxOption, type HozoComboboxProps } from './combo.tsx'
export {
  type Autocomplete,
  activeAfter,
  type Completion,
  type FilterOptions,
  filterOptions,
  inlineCompletion,
} from './combobox.ts'
export { HozoDialog, type HozoDialogProps } from './dialog.tsx'
export { type FocusCandidate, initialFocusIndex, shouldRestoreFocus } from './focus.ts'
export {
  HozoListbox,
  type HozoListboxMultipleProps,
  type HozoListboxOption,
  type HozoListboxProps,
  type HozoListboxSingleProps,
} from './listbox.tsx'
export { HozoMenu, type HozoMenuItem, type HozoMenuProps } from './menu.tsx'
export { HozoRadioGroup, type HozoRadioGroupProps, type HozoRadioOption } from './radio.tsx'
export {
  nextIndex,
  type Orientation,
  type RovingKey,
  type RovingOptions,
  tabStops,
} from './roving.ts'
export { type HozoTab, HozoTabs, type HozoTabsProps } from './tabs.tsx'
export {
  HozoToolbar,
  type HozoToolbarItem,
  type HozoToolbarItemProps,
  type HozoToolbarProps,
} from './toolbar.tsx'
export { horizontalMove, type TreeMove, type TreeNode, type TreeRow, visibleRows } from './tree.ts'
export { HozoTree, type HozoTreeProps } from './treeview.tsx'
export {
  isTypeaheadKey,
  nextSearch,
  searchIndex,
  TYPEAHEAD_TIMEOUT_MS,
  type TypeaheadOptions,
} from './typeahead.ts'
