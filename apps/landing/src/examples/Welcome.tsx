import { Heading, Section, Text } from '@hozo/core'

export function Welcome() {
  return (
    <Section accessibilityLabel="Welcome" className="gap-2 p-6">
      <Heading level={2} className="text-xl font-bold">
        Hello
      </Heading>
      <Text className="text-gray-600">Compiled at build time.</Text>
    </Section>
  )
}
