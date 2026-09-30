import type { Preview } from '@storybook/react-native'
import { View } from 'react-native'

export default {
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: '#f8fafc', padding: 16 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Preview
