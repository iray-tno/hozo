import { Button, Heading, Paragraph, View } from '@hozo/core'

export function Welcome() {
  return (
    <View className="max-w-lg w-full rounded-2xl bg-white p-8 shadow-xl space-y-6">
      <View className="space-y-2">
        <Heading level={2} className="text-2xl font-bold text-slate-950 tracking-tight">
          Hozo Storybook
        </Heading>
        <Paragraph className="text-slate-600 leading-relaxed text-sm">
          A live component catalog showcasing Hozo's cross-platform primitives and WAI-ARIA
          accessible patterns compiled to semantic Web elements and Fabric Native components.
        </Paragraph>
      </View>
      <View className="pt-2">
        <Button
          accessibilityLabel="Confirm Storybook setup"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm inline-flex justify-center items-center cursor-pointer"
          onPress={() => alert('Welcome to Hozo!')}
        >
          Get Started
        </Button>
      </View>
    </View>
  )
}
