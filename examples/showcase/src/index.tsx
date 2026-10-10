import { Button, Text, TextInput, View } from '@hozo/primitives'
import { Emphasis, Heading, Paragraph, Strong } from '@hozo/typography'
import { useState } from 'react'

export { DialogDemo, PreferencesDemo, TabsDemo } from './patterns.tsx'
export { SvgFiltersDemo } from './svg-filters.tsx'
export { VideoDemo } from './video.tsx'

// Shared story bodies: no DOM, React Native imports, or Storybook APIs.
export function ButtonDemo({ disabled = false }: { disabled?: boolean }) {
  const [count, setCount] = useState(0)
  return (
    <View className="w-full max-w-lg gap-4 rounded-2xl bg-white p-6">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Buttons
      </Heading>
      <Text className="text-base text-slate-700">Pressed {count} times</Text>
      <Button
        disabled={disabled}
        onPress={() => setCount((value) => value + 1)}
        className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Add one
      </Button>
      <Button
        onPress={() => setCount(0)}
        className="rounded-lg bg-slate-100 px-4 py-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Reset
      </Button>
    </View>
  )
}

export function TypographyDemo() {
  return (
    <View className="w-full max-w-lg gap-4 rounded-2xl bg-white p-6">
      <Heading level={1} className="text-2xl font-bold text-slate-900">
        Hozo Showcase
      </Heading>
      <Paragraph className="text-base text-slate-700">
        Shared components, with <Strong>strong text</Strong> and <Emphasis>emphasis</Emphasis>.
      </Paragraph>
      <Heading level={2} className="text-xl font-semibold text-slate-900">
        日本語の表示
      </Heading>
      <Paragraph className="text-base text-slate-700">
        文字のサイズを変えて、読みやすさを確認できます。
      </Paragraph>
    </View>
  )
}

export function FormDemo() {
  const [name, setName] = useState('')
  const [submitted, setSubmitted] = useState('')
  return (
    <View className="w-full max-w-lg gap-4 rounded-2xl bg-white p-6">
      <Heading level={2} className="text-xl font-bold text-slate-900">
        Profile
      </Heading>
      <Text className="text-base text-slate-700">Display name</Text>
      <TextInput
        accessibilityLabel="Display name"
        autoCorrect={false}
        spellCheck={false}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        style={{ fontSize: 16, color: '#0f172b' }}
        className="rounded-lg border border-slate-300 px-4 py-3"
      />
      <Button
        onPress={() => setSubmitted(name.trim())}
        disabled={!name.trim()}
        className="rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Save profile
      </Button>
      <Text className="text-base text-slate-700">
        {submitted ? `Saved: ${submitted}` : 'Not saved yet'}
      </Text>
    </View>
  )
}
