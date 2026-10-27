// Overlays held open, for the device walk to see (#1306, #1319, #1320, #1326,
// #1346).
//
// The /docs demos and the shared state screens are captured closed, so a
// dialog's body, a tooltip's content, a popover's panel, a menu's items and a
// combobox's list were never on a device screen. Each story here opens one, and the `ui-docs` walk captures
// it as `overlay-<name>.png` (`UI_OVERLAY_SCENES` in
// `scripts/ui-docs-evidence.mjs`, which waits for the same text).
//
// Native only: the shared state screens are also published on the Web, with
// reviewed accessibility and reading-order goldens, and an always-open modal
// there would be a different question.
//
// Each body is a string the compiler cannot see -- it comes from state -- so
// it is the pattern, at runtime, that has to put it in a `Text` (#1306).

import { View } from '@hozo/core'
import {
  Button,
  BottomSheet as UiBottomSheet,
  Combobox as UiCombobox,
  Dialog as UiDialog,
  Drawer as UiDrawer,
  Menu as UiMenu,
  Popover as UiPopover,
  Tooltip as UiTooltip,
} from '@hozo/ui'
import type { Meta, StoryObj } from '@storybook/react-native'
import { useState } from 'react'

function OpenDialog() {
  const [body] = useState('Dialog body, passed as a string')
  return (
    <UiDialog open onClose={() => {}} accessibilityLabel="Open dialog">
      {body}
    </UiDialog>
  )
}

function OpenTooltip() {
  const [content] = useState('Tooltip content, passed as a string')
  return (
    <View className="items-start p-8">
      <UiTooltip content={content} defaultOpen>
        <Button>Save</Button>
      </UiTooltip>
    </View>
  )
}

function OpenPopover() {
  const [body] = useState('Popover body, passed as a string')
  return (
    <View className="items-start p-8">
      <UiPopover trigger="Details" defaultOpen>
        {body}
      </UiPopover>
    </View>
  )
}

// Menu and Combobox open through `defaultOpen`; their items are labels the
// pattern draws, so the walk waits for one that only the open popup shows.
function OpenMenu() {
  return (
    <View className="items-start p-8">
      <UiMenu
        trigger="Actions"
        accessibilityLabel="Actions"
        defaultOpen
        items={[{ label: 'Menu item, shown open' }, { label: 'Delete', disabled: true }]}
      />
    </View>
  )
}

function OpenCombobox() {
  return (
    <View className="items-stretch p-8">
      <UiCombobox
        accessibilityLabel="Language"
        placeholder="Search…"
        defaultOpen
        options={[
          { value: 'shown', label: 'Combobox option, shown open' },
          { value: 'cobol', label: 'COBOL', disabled: true },
        ]}
      />
    </View>
  )
}

// The surfaces that reach the screen's bottom edge, for the safe area (#1346):
// whether the last line clears the home indicator and the gesture handle.
function OpenBottomSheet() {
  const [body] = useState('Bottom sheet body, shown open')
  return (
    <UiBottomSheet open onClose={() => {}} accessibilityLabel="Open bottom sheet">
      {body}
    </UiBottomSheet>
  )
}

function OpenDrawer() {
  const [body] = useState('Drawer body, shown open')
  return (
    <UiDrawer open onClose={() => {}} accessibilityLabel="Open drawer">
      {body}
    </UiDrawer>
  )
}

const meta = {
  title: 'UI/Open overlays',
  component: OpenDialog,
} satisfies Meta<typeof OpenDialog>
export default meta
type Story = StoryObj<typeof meta>

export const Dialog: Story = { render: () => <OpenDialog /> }
export const Tooltip: Story = { render: () => <OpenTooltip /> }
export const Popover: Story = { render: () => <OpenPopover /> }
export const Menu: Story = { render: () => <OpenMenu /> }
export const Combobox: Story = { render: () => <OpenCombobox /> }
export const BottomSheet: Story = { render: () => <OpenBottomSheet /> }
export const Drawer: Story = { render: () => <OpenDrawer /> }
