// A stepper: where a person is in a process, each step read with its
// position and status in words -- "Step 2 of 4: Profile, current" -- so the
// status is never carried by colour alone. With `onStepPress` the steps are
// buttons, for a process that can go back.

import { Stepper } from '@hozo/core'
import { Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const STEPS = [
  { label: 'Account', description: 'Email and password' },
  { label: 'Profile' },
  { label: 'Payment', status: 'error' as const },
  { label: 'Confirm' },
]

const STEP =
  'flex flex-row items-center gap-3 rounded-md px-2 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
const INDICATOR =
  'flex size-7 items-center justify-center rounded-full border-2 border-slate-400 text-xs font-semibold text-slate-700'

function StepperGallery({ pressable = false }: { pressable?: boolean }) {
  const [active, setActive] = useState(1)
  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          Stepper{pressable ? ' with pressable steps' : ''}
        </Heading>
        <Paragraph className="text-slate-700">
          Each step says where it stands in words; the marks beside them are hidden.
        </Paragraph>
      </View>
      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Checkout
        </Text>
        <Stepper
          steps={STEPS}
          activeStep={active}
          onStepPress={pressable ? setActive : undefined}
          className="flex flex-col gap-2 text-sm text-slate-800"
          stepClassName={STEP}
          currentStepClassName="font-semibold text-slate-900"
          indicatorClassName={INDICATOR}
          completedIndicatorClassName="border-indigo-700 bg-indigo-700 text-white"
          currentIndicatorClassName="border-indigo-700 text-indigo-800"
          errorIndicatorClassName="border-red-700 bg-red-700 text-white"
          descriptionClassName="ms-2 text-xs text-slate-600"
        />
      </Section>
    </View>
  )
}

const meta = {
  title: 'Patterns/Stepper',
  component: StepperGallery,
} satisfies Meta<typeof StepperGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}

export const Pressable: StoryObj<typeof meta> = { args: { pressable: true } }
