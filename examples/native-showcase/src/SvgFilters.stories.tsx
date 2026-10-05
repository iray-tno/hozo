import { SvgFiltersDemo } from '@hozo/example-showcase'
import type { Meta, StoryObj } from '@storybook/react-native'
import { ScrollView } from 'react-native'

const meta = {
  title: 'SVG/Shared filters',
  component: SvgFiltersDemo,
  decorators: [
    (Story) => (
      <ScrollView>
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof SvgFiltersDemo>
export default meta
export const Filters: StoryObj<typeof meta> = {}
