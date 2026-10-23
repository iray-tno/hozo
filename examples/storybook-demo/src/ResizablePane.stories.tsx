import type { Meta, StoryObj } from '@storybook/react-vite'
import { ResizablePaneDemo } from '../../../apps/landing/src/examples/ui/ResizablePaneDemo.tsx'

const meta = { title: 'Patterns/ResizablePane', component: ResizablePaneDemo } satisfies Meta<
  typeof ResizablePaneDemo
>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
