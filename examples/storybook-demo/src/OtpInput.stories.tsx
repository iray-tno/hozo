// A one-time code and a PIN: one real input drawn as cells. A reader finds
// one field -- "Verification code, 6 characters" -- not six; a paste of the
// whole code, or the operating system filling it from a text message, lands
// at once. The cells are drawn over the field and hidden from the reader.

import { OtpInput } from '@hozo/core'
import { Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const ROW = 'flex flex-row gap-2'
const CELL =
  'flex size-11 items-center justify-center rounded-md border border-slate-400 text-lg font-semibold text-slate-900'
const ACTIVE = 'border-2 border-indigo-700'
const FILLED = 'bg-slate-50'
const FOCUS =
  'rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

function OtpInputGallery() {
  const [code, setCode] = useState('')
  const [verified, setVerified] = useState<string | null>(null)
  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          OtpInput
        </Heading>
        <Paragraph className="text-slate-700">
          One field drawn as cells; paste a whole code, or let the system fill it.
        </Paragraph>
      </View>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Verification code
        </Text>
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={setVerified}
          accessibilityLabel="Verification code"
          className={ROW}
          cellClassName={CELL}
          activeCellClassName={ACTIVE}
          filledCellClassName={FILLED}
          inputClassName={FOCUS}
        />
        <Text className="text-sm text-slate-700">
          {verified ? `Checking ${verified}` : 'Waiting for 6 digits'}
        </Text>
      </Section>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">PIN</Text>
        <OtpInput
          length={4}
          mask
          accessibilityLabel="PIN"
          className={ROW}
          cellClassName={CELL}
          activeCellClassName={ACTIVE}
          filledCellClassName={FILLED}
          inputClassName={FOCUS}
        />
      </Section>
    </View>
  )
}

const meta = {
  title: 'Patterns/OtpInput',
  component: OtpInputGallery,
} satisfies Meta<typeof OtpInputGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
