// A chip: a filter that is on or off, an entry that can be removed, or both.
//
// The thing to hear is that a removable chip is two controls rather than one
// with two jobs: the toggle says "pressed" or "not pressed", and the remove
// button beside it says what it removes. Delete or Backspace on the toggle
// removes it too, as a chip in an input does.

import { Chip } from '@hozo/core'
import { Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const CHIP =
  'inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
const REMOVE =
  'inline-flex size-6 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

function ChipGallery() {
  const [filters, setFilters] = useState(['Remote', 'Full time', 'Senior'])
  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          Chip
        </Heading>
        <Paragraph className="text-slate-700">
          A toggle, a removable entry, or both -- and when both, two controls.
        </Paragraph>
      </View>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Selectable
        </Text>
        <View className="flex flex-row gap-2">
          <Chip defaultSelected className={CHIP}>
            Open now
          </Chip>
          <Chip defaultSelected={false} className={CHIP}>
            Free delivery
          </Chip>
        </View>
      </Section>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Removable
        </Text>
        <View className="flex flex-row gap-2">
          {filters.map((filter) => (
            <Chip
              key={filter}
              onRemove={() => setFilters((current) => current.filter((f) => f !== filter))}
              className={CHIP}
              removeClassName={REMOVE}
            >
              {filter}
            </Chip>
          ))}
        </View>
      </Section>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Label only
        </Text>
        <Chip className={CHIP}>Draft</Chip>
      </Section>
    </View>
  )
}

const meta = {
  title: 'Patterns/Chip',
  component: ChipGallery,
} satisfies Meta<typeof ChipGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
