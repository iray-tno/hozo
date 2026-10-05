import { type SvgFilterKind, SvgFilterScene } from '@hozo/example-showcase/svg-filter-scene'
import { Button, Text, View } from '@hozo/primitives'
import type { Meta, StoryObj } from '@storybook/react-native'
import { useState } from 'react'

function FilterPixels({ kind }: { kind: SvgFilterKind }) {
  const [enabled, setEnabled] = useState(false)
  return (
    <View style={{ padding: 24, gap: 24 }}>
      <Text>SVG pixel probe: {kind}</Text>
      {/* A non-flattened, exact-size host gives both drivers measurable bounds;
          the filter graph itself is the unmodified Web/Native shared scene. */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel="SVG pixel scene"
        collapsable={false}
        style={{ width: 96, height: 96 }}
      >
        <SvgFilterScene kind={kind} enabled={enabled} idPrefix="native-pixels" />
      </View>
      <Button onPress={() => setEnabled(!enabled)}>
        <Text>{enabled ? 'Turn filter off' : 'Turn filter on'}</Text>
      </Button>
    </View>
  )
}

const meta = {
  title: 'SVG/Filter pixels',
  component: FilterPixels,
} satisfies Meta<typeof FilterPixels>
export default meta
type Story = StoryObj<typeof meta>
export const Color: Story = { args: { kind: 'color' } }
export const Blur: Story = { args: { kind: 'blur' } }
export const Shadow: Story = { args: { kind: 'shadow' } }
export const Composition: Story = { args: { kind: 'composition' } }
export const Blend: Story = { args: { kind: 'blend' } }
