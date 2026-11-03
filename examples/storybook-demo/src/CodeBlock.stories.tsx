import { type CodeLine, View } from '@hozo/core'
import { CodeBlock } from '@hozo/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CodeBlockDemo } from '../../../apps/landing/src/examples/ui/CodeBlockDemo.tsx'

const meta = { title: 'Patterns/CodeBlock', component: CodeBlockDemo } satisfies Meta<
  typeof CodeBlockDemo
>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

// More lines than a windowed block mounts at first (40), so the last ones
// exist only in the hidden plain text a screen reader reads (#1408). One
// marked line, so its prefix is read there too.
const windowedLines: CodeLine[] = Array.from({ length: 60 }, (_, index) => ({
  tokens: `entry ${index + 1}`,
  mark: index === 29 ? 'ins' : undefined,
}))

export const Windowed: Story = {
  render: () => (
    <View className="w-full max-w-md">
      <CodeBlock title="entries.txt" lines={windowedLines} maxHeight={120} windowing="on" />
    </View>
  ),
}
