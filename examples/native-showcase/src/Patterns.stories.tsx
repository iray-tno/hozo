import { DialogDemo, PreferencesDemo, TabsDemo } from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-native'
import { ScrollView } from 'react-native'

const meta = {
  title: 'Patterns/Shared showcase',
  component: PreferencesDemo,
  decorators: [
    (Story) => (
      <ScrollView keyboardShouldPersistTaps="handled">
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof PreferencesDemo>
export default meta
type Story = StoryObj<typeof meta>
export const Preferences: Story = {}
export const Sections: Story = { render: () => <TabsDemo /> }
export const Confirmation: Story = { render: () => <DialogDemo /> }
export const ConfirmationOpen: Story = { render: () => <DialogDemo initiallyOpen /> }
