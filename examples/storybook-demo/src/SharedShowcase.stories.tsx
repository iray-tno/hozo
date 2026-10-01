import {
  ButtonDemo,
  DialogDemo,
  FormDemo,
  PreferencesDemo,
  TabsDemo,
  TypographyDemo,
} from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-vite'
import './SharedShowcase.css'

const meta = {
  title: 'Showcase/Shared Web and Native',
  component: ButtonDemo,
  decorators: [
    (Story) => (
      <div className="shared-showcase">
        <Story />
      </div>
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
export const Preferences: Story = { render: () => <PreferencesDemo /> }
export const Sections: Story = { render: () => <TabsDemo /> }
export const Confirmation: Story = { render: () => <DialogDemo /> }
export const ConfirmationOpen: Story = { render: () => <DialogDemo initiallyOpen /> }
