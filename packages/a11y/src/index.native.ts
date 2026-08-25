// The React Native entry point for `@hozo/a11y`. Metro resolves a platform
// extension ahead of the plain file, so `./dialog.native.tsx` is what an app
// gets on device. See `@hozo/runtime`'s `index.native.ts` for the same
// arrangement and why it is needed.

export { initialFocusIndex, shouldRestoreFocus, type FocusCandidate } from './focus.ts'
export { nextIndex, tabStops, type Orientation, type RovingKey, type RovingOptions } from './roving.ts'
export {
  isTypeaheadKey,
  nextSearch,
  searchIndex,
  TYPEAHEAD_TIMEOUT_MS,
  type TypeaheadOptions,
} from './typeahead.ts'
export { HozoDialog, type HozoDialogProps } from './dialog.native.tsx'
export { HozoTabs, type HozoTabsProps, type HozoTab } from './tabs.native.tsx'
export { HozoMenu, type HozoMenuProps, type HozoMenuItem } from './menu.native.tsx'
export { HozoToolbar, type HozoToolbarProps, type HozoToolbarItem } from './toolbar.native.tsx'
export {
  HozoRadioGroup,
  type HozoRadioGroupProps,
  type HozoRadioOption,
} from './radio.native.tsx'
export {
  HozoListbox,
  type HozoListboxProps,
  type HozoListboxOption,
  type HozoListboxSingleProps,
  type HozoListboxMultipleProps,
} from './listbox.native.tsx'
export { horizontalMove, visibleRows, type TreeNode, type TreeRow, type TreeMove } from './tree.ts'
export { HozoTree, type HozoTreeProps } from './treeview.native.tsx'
export {
  activeAfter,
  filterOptions,
  inlineCompletion,
  type Autocomplete,
  type Completion,
  type FilterOptions,
} from './combobox.ts'
export {
  HozoCombobox,
  type HozoComboboxProps,
  type HozoComboboxOption,
} from './combo.native.tsx'
