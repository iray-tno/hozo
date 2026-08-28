import type { Preview } from '@storybook/react-vite'
import '../src/preview.css'

const preview: Preview = {
  parameters: {
    layout: 'centered',
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
