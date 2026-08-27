import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button, Heading, Link, Paragraph, Pressable, Text, View } from '@hozo/core'

function ButtonGallery() {
  const [clickCount, setClickCount] = useState(0)

  return (
    <View className="max-w-2xl space-y-8 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-3">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Buttons
        </Heading>
        <Paragraph className="text-sm text-slate-600">
          Semantic buttons with real click/touch interactions, accessible focus rings, and zero runtime styling overhead.
        </Paragraph>
        <View className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            onPress={() => setClickCount((c) => c + 1)}
          >
            Primary Action ({clickCount})
          </Button>

          <Button
            className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-200"
            onPress={() => alert('Secondary clicked')}
          >
            Secondary
          </Button>

          <Button
            disabled
            className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400 cursor-not-allowed opacity-60"
            onPress={() => undefined}
          >
            Disabled Button
          </Button>

          <Button
            className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-500"
            onPress={() => alert('Destructive action')}
          >
            Destructive
          </Button>
        </View>
      </View>

      <View className="space-y-3 border-t border-slate-200 pt-6">
        <Heading level={3} className="text-lg font-bold text-slate-900">
          Pressable & Link
        </Heading>
        <View className="flex flex-wrap items-center gap-4">
          <Pressable
            accessibilityRole="button"
            className="cursor-pointer rounded-xl border border-slate-200 p-4 transition-all hover:border-indigo-500 hover:bg-indigo-50"
            onPress={() => alert('Pressable activated')}
          >
            <Text className="font-semibold text-indigo-600">Interactive Pressable Card</Text>
            <Paragraph className="mt-1 text-xs text-slate-500">Supports full responder gesture lifecycle</Paragraph>
          </Pressable>

          <Link
            href="https://github.com/iray-tno/hozo"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            GitHub Repository &rarr;
          </Link>
        </View>
      </View>
    </View>
  )
}

const meta = {
  title: 'Core/Buttons & Links',
  component: ButtonGallery,
} satisfies Meta<typeof ButtonGallery>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
