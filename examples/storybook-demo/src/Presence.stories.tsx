// A card that animates in and out, written as classes (decision 007).
//
// `starting:` is where the card enters from and `data-[state=closed]:` is
// where it leaves to. `Presence` keeps the card mounted while it leaves and
// removes it when the transition ends. The movement is under
// `motion-safe:`, so with reduced motion asked for it only fades.

import { Button, Presence, Text, View } from '@hozo/primitives'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

function PresenceDemo({ initiallyShown = true }: { initiallyShown?: boolean }) {
  const [shown, setShown] = useState(initiallyShown)

  return (
    <View className="max-w-xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Enter and exit (Presence)
      </Heading>
      <Paragraph className="text-sm text-slate-600">
        The card fades and slides in on mount and out before it is removed. With reduced motion it
        only fades.
      </Paragraph>
      <Button
        testID="presence-toggle"
        className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors inline-flex justify-center items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onPress={() => setShown((value) => !value)}
      >
        {shown ? 'Hide the card' : 'Show the card'}
      </Button>
      <Presence show={shown}>
        <View
          testID="presence-card"
          className="rounded-xl bg-indigo-50 p-4 transition duration-300 ease-out starting:opacity-0 motion-safe:starting:translate-y-4 data-[state=closed]:opacity-0 motion-safe:data-[state=closed]:translate-y-4"
        >
          <Text className="text-sm text-indigo-900">Entered from its starting style.</Text>
        </View>
      </Presence>
    </View>
  )
}

const meta = {
  title: 'Primitives/Presence',
  component: PresenceDemo,
} satisfies Meta<typeof PresenceDemo>
export default meta
export const Default: StoryObj<typeof meta> = {}
