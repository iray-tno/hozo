import type { StorybookConfig } from '@storybook/react-native'

export default {
  stories: ['../src/**/*.stories.tsx'],
  deviceAddons: ['@storybook/addon-ondevice-controls', '@storybook/addon-ondevice-actions'],
} satisfies StorybookConfig
