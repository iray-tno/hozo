import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, Heading, Link, Paragraph, Pressable, Text, View } from '@hozo/core'

function ButtonGallery() {
  return (
    <View className="max-w-2xl w-full space-y-8 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-3">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Semantic Button Variants
        </Heading>
        <Paragraph className="text-sm text-slate-600">
          Hozo lowers &lt;Button&gt; into native &lt;button type="button"&gt; on Web and accessible Pressables on Native.
        </Paragraph>
        <View className="flex flex-row flex-wrap items-center gap-3 pt-2">
          <Button
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
            onPress={() => alert('Primary Clicked')}
          >
            Primary Action
          </Button>
          <Button
            className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
            onPress={() => alert('Secondary Clicked')}
          >
            Secondary
          </Button>
          <Button
            disabled
            className="cursor-not-allowed rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400 opacity-60"
            onPress={() => {}}
          >
            Disabled Button
          </Button>
          <Button
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 transition-colors"
            onPress={() => alert('Destructive Action')}
          >
            Destructive
          </Button>
        </View>
      </View>

      <View className="space-y-3 border-t border-slate-200 pt-6">
        <Heading level={3} className="text-lg font-bold text-slate-900">
          Interactive Pressables & Links
        </Heading>
        <Paragraph className="text-sm text-slate-600">
          Cross-platform touch interactions with active pseudo-classes and universal navigation.
        </Paragraph>
        <View className="flex flex-row flex-wrap items-center gap-4">
          <Pressable
            accessibilityRole="button"
            className="cursor-pointer rounded-xl border border-slate-200 p-4 transition-all hover:bg-indigo-50 hover:border-indigo-300 active:scale-95"
            onPress={() => alert('Pressable Card Clicked')}
          >
            <Text className="font-semibold text-indigo-600">Interactive Card &rarr;</Text>
            <Paragraph className="mt-1 text-xs text-slate-500">Supports responder gestures and focus rings</Paragraph>
          </Pressable>

          <Link
            href="https://github.com/iray-tno/hozo"
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1.5"
          >
            External Link &rarr;
          </Link>
        </View>
      </View>
    </View>
  )
}

const meta = {
  title: 'Core/Button & Interactions',
  component: ButtonGallery,
} satisfies Meta<typeof ButtonGallery>

export default meta
export const Default: StoryObj<typeof meta> = {}
