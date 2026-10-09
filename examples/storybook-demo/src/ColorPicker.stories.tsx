// A colour picker: swatches you arrow through as one radio group, then hue,
// saturation and lightness as ordinary sliders -- no two-dimensional square,
// which a keyboard and a screen reader can reach but not operate -- and the
// hex. Every colour is read named and numbered: "dark blue, #1e3a8a".

import { ColorPicker } from '@hozo/core'
import { Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
const SWATCH = `size-8 rounded-full border border-slate-300 ${RING}`
const THUMB = `absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${RING}`
const INPUT = `w-32 rounded-md border border-slate-400 px-3 py-2 font-mono text-sm text-slate-900 ${RING}`

function ColorPickerGallery() {
  const [color, setColor] = useState('#3b82f6')
  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          ColorPicker
        </Heading>
        <Paragraph className="text-slate-700">Chosen: {color}</Paragraph>
      </View>
      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Theme colour
        </Text>
        <ColorPicker
          value={color}
          onChange={setColor}
          presets={['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#1e3a8a', '#a855f7']}
          accessibilityLabel="Theme colour"
          className="flex flex-col gap-3"
          swatchClassName={SWATCH}
          selectedSwatchClassName="ring-2 ring-offset-2 ring-slate-900"
          sliderClassName="relative h-3 w-full rounded-full"
          thumbClassName={THUMB}
          inputClassName={INPUT}
        />
      </Section>
    </View>
  )
}

const meta = {
  title: 'Patterns/ColorPicker',
  component: ColorPickerGallery,
} satisfies Meta<typeof ColorPickerGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
