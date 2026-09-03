import { Button, Heading, Link, Paragraph, Pressable, Text, View } from '@hozo/core'
import type { Meta, StoryObj } from '@storybook/react-vite'

function ButtonGallery() {
  return (
    <View className="max-w-2xl w-full space-y-8 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-3">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Semantic Button Variants
        </Heading>
        <Paragraph className="text-sm text-slate-600">
          Hozo lowers &lt;Button&gt; into native &lt;button type="button"&gt; on Web and accessible
          Pressables on Native.
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
            <Paragraph className="mt-1 text-xs text-slate-500">
              Supports responder gestures and focus rings
            </Paragraph>
          </Pressable>

          <Link
            href="https://github.com/iray-tno/hozo"
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1.5"
          >
            External Link &rarr;
          </Link>

          <Button
            href="https://github.com/iray-tno/hozo"
            external
            className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 transition-colors"
          >
            Button as Link &rarr;
          </Button>
        </View>
      </View>
    </View>
  )
}

function LinkButtonsDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Button as Link (&lt;Button href=&quot;...&quot;&gt;)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        When a &lt;Button&gt; receives an `href` prop, Hozo lowers it to semantic &lt;a
        role=&quot;button&quot;&gt; on Web and an accessible HozoLink on React Native.
      </Paragraph>

      <View className="space-y-4 pt-2">
        <View className="rounded-xl border border-slate-200 p-4 space-y-3">
          <Text className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Internal Route Navigation
          </Text>
          <Paragraph className="text-sm text-slate-800">
            Navigates within the application while keeping full button styling:
          </Paragraph>
          <Button
            href="/dashboard"
            className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Go to Dashboard &rarr;
          </Button>
        </View>

        <View className="rounded-xl border border-slate-200 p-4 space-y-3">
          <Text className="text-xs font-bold uppercase tracking-wider text-slate-600">
            External Link with Security Defaults
          </Text>
          <Paragraph className="text-sm text-slate-800">
            Adding external automatically sets target=&quot;_blank&quot; and rel=&quot;noreferrer
            noopener&quot;:
          </Paragraph>
          <Button
            href="https://github.com/iray-tno/hozo"
            external
            className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            View on GitHub &rarr;
          </Button>
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
export const LinkButtons: StoryObj<typeof meta> = {
  render: () => <LinkButtonsDemo />,
}
