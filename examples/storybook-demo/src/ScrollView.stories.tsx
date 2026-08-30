// The last primitive without a story, and the one with an open question
// attached.
//
// `ScrollView` is a scrollable region on both backends. On Web that is a
// `div` with `overflow`, and a scrollable region needs two things a plain
// overflow container does not get for free: it must be reachable by
// keyboard, and it must have a name. Hozo gives the first and reports the
// second when it is missing.
//
// The open finding this story is here to keep visible: an unnamed
// scrollable region is diagnosed, but a *named* one has been observed to
// go silent on Web. Both are on screen below, so the difference is
// something a person can look at rather than something recorded in an
// issue nobody opens.

import type { Meta, StoryObj } from '@storybook/react-vite'
import { Heading, Paragraph, ScrollView, Section, Text, View } from '@hozo/core'

const ROWS = [
  ['oxc', 'parses the TSX'],
  ['Style IR', 'utilities become properties'],
  ['Semantic IR', 'primitives become roles'],
  ['hozo_web', 'roles become HTML and CSS'],
  ['hozo_native', 'roles become Fabric components'],
  ['hozo_cache', 'the candidate scan, between builds'],
  ['@hozo/vite', 'splices the compiled JSX back'],
  ['@hozo/metro', 'the same, for React Native'],
] as const

function ScrollViewGallery() {
  return (
    <View className="w-full max-w-2xl space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-2">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          ScrollView
        </Heading>
        <Paragraph className="text-sm leading-relaxed text-slate-600">
          A scrollable region, named so a screen reader can announce it and
          focusable so a keyboard can reach it. Tab to the box below and use
          the arrow keys — that is the part a plain overflow container does
          not give you.
        </Paragraph>
      </View>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Vertical, named
        </Text>
        <ScrollView
          accessibilityLabel="Compiler stages"
          className="h-40 rounded-xl border border-slate-200 p-3"
        >
          <View className="space-y-2">
            {ROWS.map(([name, what]) => (
              <View key={name} className="rounded-lg bg-slate-50 p-3">
                <Text className="font-mono text-xs font-semibold text-slate-900">{name}</Text>
                <Paragraph className="mt-0.5 text-xs text-slate-500">{what}</Paragraph>
              </View>
            ))}
          </View>
        </ScrollView>
      </Section>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Horizontal
        </Text>
        {/* `horizontal` changes which axis scrolls *and* which indicator
            prop applies, which is why the two are separate props rather
            than one `showsScrollIndicator`. */}
        <ScrollView
          horizontal
          accessibilityLabel="Backends"
          className="rounded-xl border border-slate-200 p-3"
        >
          <View className="flex flex-row gap-3">
            {ROWS.map(([name]) => (
              <View key={name} className="rounded-lg bg-slate-900 px-4 py-3">
                <Text className="whitespace-nowrap font-mono text-xs text-slate-100">{name}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </Section>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Unnamed — the compiler says so
        </Text>
        <Paragraph className="text-xs text-slate-500">
          No <Text className="font-mono">accessibilityLabel</Text>. A screen
          reader announces "scroll area" and nothing else, and the build
          reports it.
        </Paragraph>
        <ScrollView className="h-24 rounded-xl border border-dashed border-amber-300 p-3">
          <Paragraph className="text-xs text-slate-500">
            Reachable, scrollable, and anonymous.
          </Paragraph>
        </ScrollView>
      </Section>
    </View>
  )
}

const meta = {
  title: 'Core/ScrollView',
  component: ScrollViewGallery,
} satisfies Meta<typeof ScrollViewGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
