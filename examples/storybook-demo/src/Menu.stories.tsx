import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button, Heading, Menu, Paragraph, RadioGroup, View } from '@hozo/core'

function MenuDemo() {
  const [theme, setTheme] = useState('dark')
  const themeOptions = [
    { value: 'dark', label: 'Dark Mode (Default)' },
    { value: 'light', label: 'Light Mode' },
    { value: 'system', label: 'System Preference' },
  ]

  const menuItems = [
    { label: 'User Profile', onSelect: () => alert('Profile clicked') },
    { label: 'Compiler Settings', onSelect: () => alert('Settings clicked') },
    { label: 'Export StyleSheet', onSelect: () => alert('Export clicked') },
  ]

  return (
    <View className="max-w-xl space-y-8 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-3">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Menu (@hozo/a11y)
        </Heading>
        <Paragraph className="text-sm text-slate-600">
          Accessible action menu popover with keyboard arrow navigation, Escape handling, and focus restoration.
        </Paragraph>
        <Menu
          trigger={
            <Button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Options Menu &darr;
            </Button>
          }
          items={menuItems}
          className="relative inline-block"
          menuClassName="absolute left-0 mt-2 w-48 rounded-xl bg-white shadow-xl border border-slate-200 p-1.5 z-20"
          itemClassName="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-100 text-slate-700 data-[hozo-active]:bg-indigo-50 data-[hozo-active]:text-indigo-700"
        />
      </View>

      <View className="space-y-3 border-t border-slate-200 pt-6">
        <Heading level={3} className="text-base font-bold text-slate-900">
          Radio Group
        </Heading>
        <Paragraph className="text-xs text-slate-500">
          Single value group where selection follows keyboard focus.
        </Paragraph>
        <RadioGroup
          options={themeOptions}
          value={theme}
          onValueChange={setTheme}
          accessibilityLabel="Color Theme"
          className="space-y-2"
          optionClassName="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700 data-[hozo-checked]:font-semibold data-[hozo-checked]:text-indigo-600"
        />
      </View>
    </View>
  )
}

const meta = { title: 'A11y/Menu & Radio', component: MenuDemo } satisfies Meta<typeof MenuDemo>
export default meta
export const Default: StoryObj<typeof meta> = {}
