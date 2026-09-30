import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  // The viewport toolbar is what makes `Core/Responsive` readable: a
  // breakpoint is a fact about the window, and the only way to see one is
  // to change it. Storybook 10 ships it in core, so this costs no
  // dependency.
  addons: ['storybook/viewport', '@storybook/addon-a11y', '@hozo/storybook'],
  typescript: {
    reactDocgen: false,
  },
  // Shared demo packages have development React peers of their own. Hooks
  // must use this Storybook renderer's React, not the source's neighbor.
  viteFinal: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      dedupe: [...new Set([...(config.resolve?.dedupe ?? []), 'react', 'react-dom'])],
    },
  }),
}

export default config
