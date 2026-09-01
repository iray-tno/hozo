import { Button, Heading, Paragraph, TextInput, View } from '@hozo/core'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

function TextInputGallery() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <View className="max-w-md w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Form Controls
      </Heading>
      <Paragraph className="text-sm text-slate-600">
        Universal TextInput primitives compiling to accessible Web input tags or Fabric TextInput
        components.
      </Paragraph>

      <View className="space-y-4">
        <View className="space-y-1.5">
          <Paragraph className="text-xs font-semibold text-slate-700">Email Address</Paragraph>
          <TextInput
            accessibilityLabel="Email Address"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors shadow-sm"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View className="space-y-1.5">
          <Paragraph className="text-xs font-semibold text-slate-700">Search Query</Paragraph>
          <TextInput
            accessibilityLabel="Search Query"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors shadow-sm"
            placeholder="Search documentation..."
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <View className="space-y-1.5">
          <Paragraph className="text-xs font-semibold text-slate-700">Read-Only Field</Paragraph>
          <TextInput
            accessibilityLabel="Read-Only Field"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 cursor-not-allowed shadow-none"
            value="Read-only system value"
          />
        </View>

        <Button
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm flex justify-center items-center cursor-pointer mt-2"
          onPress={() => alert(`Submitted: ${email}`)}
        >
          Sign In
        </Button>
      </View>
    </View>
  )
}

const meta = {
  title: 'Core/TextInput',
  component: TextInputGallery,
} satisfies Meta<typeof TextInputGallery>

export default meta
export const Default: StoryObj<typeof meta> = {}
