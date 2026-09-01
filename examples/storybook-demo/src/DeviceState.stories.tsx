// The variants that need a device, not a DOM.
//
// `packages/tailwind-conformance` compares text and renders to static
// markup -- `render.ts` says so: "Static markup rather than a real DOM ...
// without a jsdom in the tree". It can prove Hozo emits
// `@media (prefers-color-scheme: dark) { ... }` byte-for-byte against
// Tailwind. It cannot say whether anything happens when the reader's
// machine is actually in dark mode, because there is no CSS engine in it
// and no machine to ask.
//
// These stories are that other half. Each card is driven by an OS or
// browser setting rather than by anything on the page, so the way to read
// them is to change the setting and watch. `scripts/check-build.mjs` does
// the same through Chrome's emulation, which is what makes them evidence
// rather than decoration.

import { Heading, Paragraph, Pressable, Section, Text, View } from '@hozo/core'
import type { Meta, StoryObj } from '@storybook/react-vite'

const CARD = 'rounded-xl border border-slate-200 p-5 space-y-3'
const LABEL = 'text-xs font-semibold uppercase tracking-wide text-slate-500'

function Card({
  title,
  driver,
  children,
}: {
  title: string
  driver: string
  children: React.ReactNode
}) {
  return (
    <Section className={CARD}>
      <View className="space-y-1">
        <Heading level={3} className="text-base font-bold text-slate-900">
          {title}
        </Heading>
        <Text className={LABEL}>{driver}</Text>
      </View>
      {children}
    </Section>
  )
}

function DeviceStateGallery() {
  return (
    <View className="max-w-2xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <View className="space-y-2">
        <Heading level={2} className="text-xl font-bold text-slate-900">
          Device State
        </Heading>
        <Paragraph className="text-sm leading-relaxed text-slate-600">
          Five variants whose condition lives outside the page. Nothing here responds to a click —
          change the setting named under each heading.
        </Paragraph>
      </View>

      <Card title="Colour scheme" driver="prefers-color-scheme">
        <View className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
          <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Light by default, slate-900 in dark mode.
          </Text>
        </View>
      </Card>

      <Card title="Forced colours" driver="Windows High Contrast, forced-colors: active">
        {/* The system palette replaces every author colour. A border that
            exists only in this mode is how a component keeps an edge the
            user can see once the background is gone. */}
        <View className="rounded-lg bg-indigo-50 p-4 forced-colors:border-2 forced-colors:bg-transparent">
          <Text className="text-sm text-indigo-900 forced-colors:text-[CanvasText]">
            The indigo disappears; the border appears.
          </Text>
        </View>
        {/* Hozo already emits `[data-hozo-disabled] { color: GrayText }`
            under `@media (forced-colors: active)` for every disabled
            element, and nothing in this repository had ever looked at it. */}
        <Pressable
          disabled
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400"
        >
          Disabled — GrayText in forced colours
        </Pressable>
      </Card>

      <Card title="Reduced motion" driver="prefers-reduced-motion">
        <View className="rounded-lg border border-slate-200 p-4 transition-colors duration-500 hover:bg-emerald-50 motion-reduce:transition-none">
          <Text className="text-sm text-slate-700">
            Hover fades over 500ms, or changes instantly when motion is reduced.
          </Text>
        </View>
      </Card>

      <Card title="Increased contrast" driver="prefers-contrast — see issue #7">
        {/* On Web this is a media query like any other. On React Native it
            needs a real device to settle, which is what #7 is about. */}
        <View className="rounded-lg border border-slate-200 p-4 contrast-more:border-2 contrast-more:border-slate-900">
          <Text className="text-sm text-slate-500 contrast-more:font-semibold contrast-more:text-slate-950">
            Muted text darkens and the border thickens.
          </Text>
        </View>
      </Card>

      <Card title="Print" driver="print stylesheet">
        <View className="space-y-2">
          <Text className="text-sm text-slate-700 print:text-black">
            Body copy, forced to black on paper.
          </Text>
          <Text className="text-sm text-slate-500 print:hidden">
            This line is screen-only and is dropped from the printed page.
          </Text>
        </View>
      </Card>
    </View>
  )
}

const meta = {
  title: 'Core/Device State',
  component: DeviceStateGallery,
} satisfies Meta<typeof DeviceStateGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
