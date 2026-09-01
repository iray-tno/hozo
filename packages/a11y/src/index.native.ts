// The React Native entry point for `@hozo/a11y`. Metro resolves a platform
// extension ahead of the plain file, so `./dialog.native.tsx` is what an app
// gets on device. See `@hozo/runtime`'s `index.native.ts` for the same
// arrangement and why it is needed.

export {
  HozoCombobox,
  type HozoComboboxOption,
  type HozoComboboxProps,
} from './combo.native.tsx'
export {
  type Autocomplete,
  activeAfter,
  type Completion,
  type FilterOptions,
  filterOptions,
  inlineCompletion,
} from './combobox.ts'
export { HozoDialog, type HozoDialogProps } from './dialog.native.tsx'
export { type FocusCandidate, initialFocusIndex, shouldRestoreFocus } from './focus.ts'
export {
  HozoListbox,
  type HozoListboxMultipleProps,
  type HozoListboxOption,
  type HozoListboxProps,
  type HozoListboxSingleProps,
} from './listbox.native.tsx'
export { HozoMenu, type HozoMenuItem, type HozoMenuProps } from './menu.native.tsx'
export {
  HozoRadioGroup,
  type HozoRadioGroupProps,
  type HozoRadioOption,
} from './radio.native.tsx'
export {
  nextIndex,
  type Orientation,
  type RovingKey,
  type RovingOptions,
  tabStops,
} from './roving.ts'
export { type HozoTab, HozoTabs, type HozoTabsProps } from './tabs.native.tsx'
export { HozoToolbar, type HozoToolbarItem, type HozoToolbarProps } from './toolbar.native.tsx'
export { horizontalMove, type TreeMove, type TreeNode, type TreeRow, visibleRows } from './tree.ts'
export { HozoTree, type HozoTreeProps } from './treeview.native.tsx'
export {
  isTypeaheadKey,
  nextSearch,
  searchIndex,
  TYPEAHEAD_TIMEOUT_MS,
  type TypeaheadOptions,
} from './typeahead.ts'
