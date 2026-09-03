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
          Interactive Pressables &amp; Links
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

function SemanticVariantsDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Button Variants &amp; States
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Buttons automatically compile to native semantic &lt;button type="button"&gt; preventing
        accidental form submissions.
      </Paragraph>

      <View className="space-y-4 pt-2">
        <View className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
          <View>
            <Text className="text-sm font-bold text-slate-900">Primary Button</Text>
            <Text className="text-xs text-slate-500">
              Main call-to-action for the page or modal
            </Text>
          </View>
          <Button
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            onPress={() => alert('Primary action')}
          >
            Submit
          </Button>
        </View>

        <View className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
          <View>
            <Text className="text-sm font-bold text-slate-900">Secondary Button</Text>
            <Text className="text-xs text-slate-500">Alternative or cancel action</Text>
          </View>
          <Button
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            onPress={() => alert('Cancelled')}
          >
            Cancel
          </Button>
        </View>

        <View className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
          <View>
            <Text className="text-sm font-bold text-slate-900">Destructive Button</Text>
            <Text className="text-xs text-slate-500">Irreversible action like deleting data</Text>
          </View>
          <Button
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
            onPress={() => alert('Delete confirmed')}
          >
            Delete Item
          </Button>
        </View>

        <View className="flex flex-row items-center justify-between pt-1">
          <View>
            <Text className="text-sm font-bold text-slate-900">Disabled Button</Text>
            <Text className="text-xs text-slate-500">
              Inoperable and announced as disabled to screen readers
            </Text>
          </View>
          <Button
            disabled
            className="cursor-not-allowed rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400 opacity-60"
            onPress={() => {}}
          >
            Unavailable
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

function InteractivePressablesDemo() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading
        level={2}
        className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3"
      >
        Interactive Pressables (&lt;Pressable&gt;)
      </Heading>
      <Paragraph className="text-sm text-slate-700">
        Universal touch feedback primitive compiling to active pseudo-classes on Web and native
        gesture handlers on React Native.
      </Paragraph>

      <View className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <Pressable
          accessibilityRole="button"
          className="cursor-pointer rounded-xl border border-slate-200 p-5 transition-all hover:bg-indigo-50 hover:border-indigo-300 active:scale-95"
          onPress={() => alert('Quick Action 1')}
        >
          <Text className="font-bold text-slate-900">Card Action 1 &rarr;</Text>
          <Paragraph className="mt-1 text-xs text-slate-500">
            Responds to hover and active states with scaling animation
          </Paragraph>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          className="cursor-pointer rounded-xl border border-slate-200 p-5 transition-all hover:bg-emerald-50 hover:border-emerald-300 active:scale-95"
          onPress={() => alert('Quick Action 2')}
        >
          <Text className="font-bold text-slate-900">Card Action 2 &rarr;</Text>
          <Paragraph className="mt-1 text-xs text-slate-500">
            Accessible role="button" with full keyboard navigation
          </Paragraph>
        </Pressable>
      </View>
    </View>
  )
}

const meta = {
  title: 'Core/Button & Interactions',
  component: ButtonGallery,
} satisfies Meta<typeof ButtonGallery>

export default meta
export const Showcase: StoryObj<typeof meta> = {}
export const SemanticVariants: StoryObj<typeof meta> = {
  render: () => <SemanticVariantsDemo />,
}
export const LinkButtons: StoryObj<typeof meta> = {
  render: () => <LinkButtonsDemo />,
}
export const InteractivePressables: StoryObj<typeof meta> = {
  render: () => <InteractivePressablesDemo />,
}
