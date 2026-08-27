import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Combobox, Heading, Listbox, Paragraph, View } from '@hozo/core'

function ComboboxDemo() {
  const [selectedBundler, setSelectedBundler] = useState('vite')
  const options = [
    { value: 'vite', label: 'Vite (@hozo/vite)' },
    { value: 'next', label: 'Next.js (@hozo/next)' },
    { value: 'metro', label: 'Metro (@hozo/metro)' },
    { value: 'storybook', label: 'Storybook (@hozo/storybook)' },
    { value: 'tanstack', label: 'TanStack Start' },
  ]

  return (
    <View className="max-w-xl space-y-8 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-3">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Combobox (@hozo/a11y)
        </Heading>
        <Paragraph className="text-sm text-slate-600">
          Accessible autocomplete dropdown where focus stays in the text field and active options are announced via <code className="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">aria-activedescendant</code>.
        </Paragraph>
        <Combobox
          options={options}
          value={selectedBundler}
          onValueChange={setSelectedBundler}
          placeholder="Search bundler integration..."
          accessibilityLabel="Select bundler"
          className="relative"
          inputClassName="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          listClassName="absolute top-full mt-1 w-full rounded-xl bg-white shadow-xl border border-slate-200 p-1 z-10"
          optionClassName="p-2 rounded-lg text-sm cursor-pointer hover:bg-slate-100 data-[hozo-active]:bg-indigo-50 data-[hozo-active]:text-indigo-700"
        />
      </View>

      <View className="space-y-3 border-t border-slate-200 pt-6">
        <Heading level={3} className="text-base font-bold text-slate-900">
          Listbox
        </Heading>
        <Paragraph className="text-xs text-slate-500">
          Single and multiple selection with keyboard typeahead matching.
        </Paragraph>
        <Listbox
          options={options}
          value={selectedBundler}
          onValueChange={setSelectedBundler}
          accessibilityLabel="Bundler options listbox"
          className="rounded-xl border border-slate-200 p-2 divide-y divide-slate-100"
          optionClassName="p-2.5 rounded-lg text-sm cursor-pointer hover:bg-slate-100 data-[hozo-selected]:bg-indigo-50 data-[hozo-selected]:text-indigo-700 data-[hozo-selected]:font-semibold"
        />
      </View>
    </View>
  )
}

const meta = { title: 'A11y/Combobox', component: ComboboxDemo } satisfies Meta<typeof ComboboxDemo>
export default meta
export const Default: StoryObj<typeof meta> = {}
