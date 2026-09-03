import type { Preview } from '@storybook/react-vite'
import '../src/preview.css'

const preview: Preview = {
  parameters: {
    options: {
      storySort: {
        order: [
          'Welcome',
          'Core',
          [
            'Button & Interactions',
            'Layout & Lists',
            'ScrollView',
            'TextInput',
            'Media & Svg',
            'Combobox',
            'Dialog',
            'Menu & Radio',
            'Tabs',
            'Toolbar',
            'Tree',
            'Device State',
            'PanResponder',
            'Responsive',
          ],
          'Behaviors',
          'Semantics',
          'Typography',
        ],
      },
    },
    layout: 'padded',
    backgrounds: {
      default: 'slate',
      values: [
        { name: 'slate', value: '#f8fafc' },
        { name: 'white', value: '#ffffff' },
        { name: 'dark', value: '#0f172a' },
      ],
    },
  },
}

export default preview
