import type { Meta, StoryObj } from '@storybook/react-vite'
import { Heading, Paragraph, Tabs, View } from '@hozo/core'

function TabsDemo() {
  const tabs = [
    {
      label: 'Overview',
      content: (
        <Paragraph className="text-sm leading-relaxed text-slate-700">
          Hozo is a universal UI compiler compiling React Native towards semantic HTML/CSS and Fabric.
        </Paragraph>
      ),
    },
    {
      label: 'Features',
      content: (
        <Paragraph className="text-sm leading-relaxed text-slate-700">
          Tiered style resolution, 5 bundler integrations, and zero-runtime static styles.
        </Paragraph>
      ),
    },
    {
      label: 'Performance',
      content: (
        <Paragraph className="text-sm leading-relaxed text-slate-700">
          Rust-powered oxc AST transformation delivering sub-millisecond compilation passes.
        </Paragraph>
      ),
    },
  ]

  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Tabs Pattern (@hozo/a11y)
      </Heading>
      <Paragraph className="text-sm text-slate-600">
        WAI-ARIA compliant tab list with single tab stop and left/right arrow key roving tabindex navigation.
      </Paragraph>
      <Tabs
        tabs={tabs}
        defaultIndex={0}
        accessibilityLabel="Hozo documentation sections"
        className="space-y-4"
        tabListClassName="flex border-b border-slate-200 gap-2"
        tabClassName="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-indigo-600 cursor-pointer rounded-t-lg transition-colors border-b-2 border-transparent data-[hozo-selected]:border-indigo-600 data-[hozo-selected]:text-indigo-600"
        panelClassName="rounded-xl bg-slate-50 p-6 min-h-[100px]"
      />
    </View>
  )
}

const meta = { title: 'A11y/Tabs', component: TabsDemo } satisfies Meta<typeof TabsDemo>
export default meta
export const Default: StoryObj<typeof meta> = {}
