import type { Meta, StoryObj } from '@storybook/react-native'
import { TextInheritanceProbe } from './text-inheritance-probe'

const meta = {
  title: 'Diagnostics/Text inheritance',
  component: TextInheritanceProbe,
} satisfies Meta<typeof TextInheritanceProbe>
export default meta
export const Comparison: StoryObj<typeof meta> = {}
