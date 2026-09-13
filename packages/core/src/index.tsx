// Zero-setup facade. Components are implemented by their domain package;
// core deliberately owns no second copy of them.

export {
  type Autocomplete,
  Dialog,
  type DialogProps,
  HozoCombobox as Combobox,
  HozoCombobox,
  type HozoComboboxOption as ComboboxOption,
  type HozoComboboxOption,
  type HozoComboboxProps as ComboboxProps,
  type HozoComboboxProps,
  HozoListbox as Listbox,
  HozoListbox,
  type HozoListboxOption as ListboxOption,
  type HozoListboxOption,
  type HozoListboxProps as ListboxProps,
  type HozoListboxProps,
  HozoMenu as Menu,
  HozoMenu,
  type HozoMenuItem as MenuItem,
  type HozoMenuItem,
  type HozoMenuProps as MenuProps,
  type HozoMenuProps,
  HozoRadioGroup as RadioGroup,
  HozoRadioGroup,
  type HozoRadioGroupProps as RadioGroupProps,
  type HozoRadioGroupProps,
  type HozoRadioOption as RadioOption,
  type HozoRadioOption,
  type HozoTab as Tab,
  type HozoTab,
  HozoTabs as Tabs,
  HozoTabs,
  type HozoTabsProps as TabsProps,
  type HozoTabsProps,
  HozoToolbar as Toolbar,
  HozoToolbar,
  type HozoToolbarItem as ToolbarItem,
  type HozoToolbarItem,
  type HozoToolbarItemProps as ToolbarItemProps,
  type HozoToolbarItemProps,
  type HozoToolbarProps as ToolbarProps,
  type HozoToolbarProps,
  HozoTree as Tree,
  HozoTree,
  type HozoTreeProps as TreeProps,
  type HozoTreeProps,
  type TreeNode,
} from '@hozo/patterns'
export * from '@hozo/primitives'
export * from '@hozo/semantics'
export * from '@hozo/typography'
// Kept in the facade until the RN compatibility package owns this surface.
export type {
  PanResponderCallbacks,
  PanResponderGestureState,
  PanResponderInstance,
} from './pan-responder.ts'
export { PanResponder } from './pan-responder.ts'
export { Svg } from './svg.tsx'
