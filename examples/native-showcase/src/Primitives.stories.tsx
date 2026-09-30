import { ButtonDemo, FormDemo, TypographyDemo } from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-native'
import { ScrollView } from 'react-native'

const meta = {
  title: 'Primitives/Shared showcase',
  component: ButtonDemo,
  decorators: [
    (Story) => (
      <ScrollView keyboardShouldPersistTaps="handled">
        <Story />
      </ScrollView>
    ),
  ],
  args: { disabled: false },
  argTypes: { disabled: { control: 'boolean' } },
} satisfies Meta<typeof ButtonDemo>
export default meta
type Story = StoryObj<typeof meta>
export const Buttons: Story = {}
export const Disabled: Story = { args: { disabled: true } }
export const Typography: Story = { render: () => <TypographyDemo /> }
export const Form: Story = { render: () => <FormDemo /> }
