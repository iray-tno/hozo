// An avatar: a picture, or initials when there is none, read as one image
// named for the person -- "Ada Lovelace, online" -- whatever is drawn. The
// letters and the picture are hidden, because "A L" read aloud is a worse
// name for the same person. One with no name is decoration and is skipped.

import { Avatar } from '@hozo/core'
import { Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'

const AVATAR =
  'relative flex size-12 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-800'
const DOT = 'absolute bottom-0 end-0 size-3 rounded-full border-2 border-white'

function AvatarGallery() {
  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          Avatar
        </Heading>
        <Paragraph className="text-slate-700">
          One image named for the person, with the status read after the name.
        </Paragraph>
      </View>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Initials and status
        </Text>
        <View className="flex flex-row gap-4">
          <Avatar
            name="Ada Lovelace"
            status="online"
            className={AVATAR}
            statusClassName={`${DOT} bg-emerald-600`}
          />
          <Avatar
            name="Grace Hopper"
            status="busy"
            className={AVATAR}
            statusClassName={`${DOT} bg-red-600`}
          />
          <Avatar name="田中太郎" className={AVATAR} />
        </View>
      </Section>

      <Section className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Decorative, beside a name already written
        </Text>
        <View className="flex flex-row items-center gap-3">
          <Avatar initials="KJ" className={AVATAR} />
          <Text className="text-slate-800">Katherine Johnson</Text>
        </View>
      </Section>
    </View>
  )
}

const meta = {
  title: 'Patterns/Avatar',
  component: AvatarGallery,
} satisfies Meta<typeof AvatarGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
