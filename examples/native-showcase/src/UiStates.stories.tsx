import { uiStateScenes } from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-native'
import { ScrollView } from 'react-native'

const meta = {
  title: 'UI/Shared state checks',
  component: uiStateScenes.Tabs,
  decorators: [
    (Story) => (
      <ScrollView keyboardShouldPersistTaps="handled">
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof uiStateScenes.Tabs>
export default meta
type Story = StoryObj<typeof meta>

export const Tabs: Story = { render: uiStateScenes.Tabs }
export const Accordion: Story = { render: uiStateScenes.Accordion }
export const Radio: Story = { render: uiStateScenes.Radio }
export const Listbox: Story = { render: uiStateScenes.Listbox }
export const Menu: Story = { render: uiStateScenes.Menu }
export const Chip: Story = { render: uiStateScenes.Chip }
export const Pagination: Story = { render: uiStateScenes.Pagination }
export const Tree: Story = { render: uiStateScenes.Tree }
export const Checkbox: Story = { render: uiStateScenes.Checkbox }
export const Switch: Story = { render: uiStateScenes.Switch }
