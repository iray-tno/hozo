// Icons: an inline <svg> drawn from the data an icon set exports, stroked in
// the text's colour. Beside a word an icon is decoration and says nothing;
// alone on a button the button is named, and the icon still says nothing;
// named itself, an icon is an image with that name.
//
// The shapes below are Lucide's (ISC licence, https://lucide.dev), copied in
// the `IconNode` form `lucide` exports, so the story needs no dependency. An
// application would import them from the set instead.

import { Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Icon, type IconNode } from '@hozo/svg'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'

const SEARCH: IconNode = [
  ['path', { d: 'm21 21-4.34-4.34', key: '14j7rj' }],
  ['circle', { cx: '11', cy: '11', r: '8', key: '4ej97u' }],
]
const HEART: IconNode = [
  [
    'path',
    {
      d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
      key: 'c3ymky',
    },
  ],
]
const WIFI: IconNode = [
  ['path', { d: 'M12 20h.01', key: 'zekei9' }],
  ['path', { d: 'M2 8.82a15 15 0 0 1 20 0', key: 'dnpr2z' }],
  ['path', { d: 'M5 12.859a10 10 0 0 1 14 0', key: '1x1e6c' }],
  ['path', { d: 'M8.5 16.429a5 5 0 0 1 7 0', key: '1bycff' }],
]

const BUTTON =
  'inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

function IconGallery() {
  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          Icons
        </Heading>
        <Paragraph className="text-slate-700">
          Decoration beside a word, named only when the icon is the information.
        </Paragraph>
      </View>
      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Beside a word
        </Text>
        <button type="button" className={BUTTON}>
          <Icon icon={SEARCH} size={16} />
          Search
        </button>
      </Section>
      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          The only thing on a button
        </Text>
        <button type="button" aria-label="Like post" className={`${BUTTON} text-red-700`}>
          <Icon icon={HEART} size={20} />
        </button>
      </Section>
      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          The information itself
        </Text>
        <View className="flex flex-row items-center gap-2 text-slate-800">
          <Icon icon={WIFI} size={20} accessibilityLabel="Connected" />
          <Text className="text-sm text-slate-700">Home network</Text>
        </View>
      </Section>
    </View>
  )
}

const meta = {
  title: 'Media/Icons',
  component: IconGallery,
} satisfies Meta<typeof IconGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
