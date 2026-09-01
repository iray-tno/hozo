// Breakpoints, container queries, and the overflow they cause.
//
// Hozo writes every breakpoint as a *range* rather than as a lower bound,
// so `md:` is `(min-width: 48rem) and (max-width: 63.999rem)` and not
// `(min-width: 48rem)`. The conformance audit compares that text against
// Tailwind's and finds it identical, which settles what is emitted and
// says nothing about what happens at 1023.5px in a browser. A boundary is
// the one thing a string comparison cannot check.
//
// The viewport toolbar drives these. `2xl` needs 1536px, which is wider
// than most preview panes -- use the responsive viewport and widen the
// window, or read the indicator, which says which range is live.

import { Heading, Paragraph, Section, Text, View } from '@hozo/core'
import type { Meta, StoryObj } from '@storybook/react-vite'

const CARD = 'rounded-xl border border-slate-200 p-5 space-y-3'
const CHIP = 'rounded-md px-2 py-1 text-xs font-semibold'

/** Exactly one of these is visible, and it names the live range. */
function BreakpointIndicator() {
  return (
    <View className="flex flex-row flex-wrap gap-2">
      <Text className={`${CHIP} bg-slate-900 text-white sm:hidden`}>base &lt; 40rem</Text>
      <Text className={`${CHIP} hidden bg-rose-600 text-white sm:block md:hidden`}>sm</Text>
      <Text className={`${CHIP} hidden bg-amber-700 text-white md:block lg:hidden`}>md</Text>
      <Text className={`${CHIP} hidden bg-emerald-700 text-white lg:block xl:hidden`}>lg</Text>
      <Text className={`${CHIP} hidden bg-sky-700 text-white xl:block 2xl:hidden`}>xl</Text>
      <Text className={`${CHIP} hidden bg-indigo-600 text-white 2xl:block`}>2xl &ge; 96rem</Text>
    </View>
  )
}

function ResponsiveGallery() {
  return (
    <View className="w-full max-w-6xl space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-2">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Responsive
        </Heading>
        <Paragraph className="text-sm leading-relaxed text-slate-600">
          Resize the viewport. Every card below changes at a boundary, and the boundary is the part
          no string comparison can check.
        </Paragraph>
      </View>

      <Section className={CARD}>
        <Heading level={3} className="text-base font-bold text-slate-900">
          Which range is live
        </Heading>
        {/* Each chip is visible in one range only, so two chips at once
            means two ranges overlap and none means there is a gap between
            them. Both are what writing breakpoints as ranges risks. */}
        <BreakpointIndicator />
      </Section>

      <Section className={CARD}>
        <Heading level={3} className="text-base font-bold text-slate-900">
          Layout by breakpoint
        </Heading>
        <View className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {['oxc parse', 'Style IR', 'Semantic IR', 'Target lowering'].map((label) => (
            <View key={label} className="rounded-lg bg-slate-50 p-4">
              <Text className="text-sm font-semibold text-slate-900">{label}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section className={CARD}>
        <Heading level={3} className="text-base font-bold text-slate-900">
          Upper bounds and explicit ranges
        </Heading>
        {/* `max-md:` and `min-lg:` name the halves directly. If the
            compiled ranges were wrong at an edge, these and the plain
            forms above would disagree somewhere. */}
        <View className="space-y-2">
          <Text className="hidden text-sm font-semibold text-rose-700 max-md:block">
            max-md: narrower than 48rem
          </Text>
          <Text className="hidden text-sm font-semibold text-emerald-700 min-lg:block">
            min-lg: 64rem and wider
          </Text>
          <Text className="hidden text-sm font-semibold text-amber-700 md:max-lg:block">
            md:max-lg: between 48rem and 64rem, from two variants at once
          </Text>
        </View>
      </Section>

      <Section className={CARD}>
        <Heading level={3} className="text-base font-bold text-slate-900">
          Container queries
        </Heading>
        <Paragraph className="text-xs text-slate-500">
          The same component in two slots. It reads its container, not the viewport, so these differ
          from each other at any window width.
        </Paragraph>
        <View className="flex flex-row gap-4">
          <View className="@container w-1/3 rounded-lg border border-dashed border-slate-300 p-3">
            <View className="flex flex-col gap-2 @md:flex-row">
              <Text className="text-sm font-semibold text-slate-900">Narrow</Text>
              <Text className="text-sm text-slate-500">stacks</Text>
            </View>
          </View>
          <View className="@container w-2/3 rounded-lg border border-dashed border-slate-300 p-3">
            <View className="flex flex-col gap-2 @md:flex-row">
              <Text className="text-sm font-semibold text-slate-900">Wide</Text>
              <Text className="text-sm text-slate-500">sits in a row</Text>
            </View>
          </View>
        </View>
      </Section>

      <Section className={CARD}>
        <Heading level={3} className="text-base font-bold text-slate-900">
          Content that does not want to fit
        </Heading>
        <Paragraph className="text-xs text-slate-500">
          The complaint that started this: text leaving its card. An unbreakable string is the case
          a fixed-width story never produces.
        </Paragraph>
        <View className="space-y-3">
          <View className="rounded-lg bg-slate-50 p-3">
            <Text className="break-all text-sm text-slate-700">
              https://example.invalid/a/very/long/path/that/has/nowhere/to/wrap/because/it/contains/no/spaces/at/all
            </Text>
          </View>
          <View className="rounded-lg bg-slate-50 p-3">
            <Heading level={4} className="text-lg font-bold break-words text-slate-900">
              Pneumonoultramicroscopicsilicovolcanoconiosis
            </Heading>
          </View>
          <View className="max-w-xs overflow-x-auto rounded-lg bg-slate-900 p-3">
            <Text className="whitespace-nowrap font-mono text-xs text-slate-100">
              cargo build --release -p hozo_napi &amp;&amp; pnpm --filter @hozo/compiler build
            </Text>
          </View>
        </View>
      </Section>
    </View>
  )
}

const meta = {
  title: 'Core/Responsive',
  component: ResponsiveGallery,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ResponsiveGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
