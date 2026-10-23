import type { Meta, StoryObj } from '@storybook/react-vite'
import { CodeBlockDemo } from '../../../apps/landing/src/examples/ui/CodeBlockDemo.tsx'

const meta = { title: 'Patterns/CodeBlock', component: CodeBlockDemo } satisfies Meta<
  typeof CodeBlockDemo
>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
