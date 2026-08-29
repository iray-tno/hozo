import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  // The viewport toolbar is what makes `Core/Responsive` readable: a
  // breakpoint is a fact about the window, and the only way to see one is
  // to change it. Storybook 10 ships it in core, so this costs no
  // dependency.
  addons: ['storybook/viewport', '@hozo/storybook'],
  typescript: {
    reactDocgen: false,
  },
}

export default config
