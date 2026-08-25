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
