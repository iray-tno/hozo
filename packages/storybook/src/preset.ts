import { type HozoOptions, hozo } from '@hozo/vite'
import type { UserConfig } from 'vite'

export type HozoStorybookOptions = HozoOptions

/**
 * Storybook preset hook: installs Hozo before framework transform plugins.
 *
 * Options are forwarded whole. Naming them one by one -- which this did --
 * meant every option added to `@hozo/vite` afterwards was accepted here,
 * type-checked here, and then dropped on the floor.
 */
export function viteFinal(config: UserConfig, options: HozoStorybookOptions = {}): UserConfig {
  return {
    ...config,
    plugins: [hozo(options), ...(config.plugins ?? [])],
  }
}
