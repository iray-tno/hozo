import { type HozoOptions, hozo } from '@hozo/vite'
import type { PluginOption, UserConfig } from 'vite'

export type HozoStorybookOptions = HozoOptions

/** Whether `plugins`, nested as Vite allows, already holds Hozo's plugin. */
function hasHozo(plugins: PluginOption[] | undefined): boolean {
  return (plugins ?? [])
    .flat(Number.POSITIVE_INFINITY as 1)
    .some(
      (plugin) =>
        typeof plugin === 'object' &&
        plugin !== null &&
        'name' in plugin &&
        (plugin as { name: unknown }).name === 'hozo',
    )
}

/**
 * Storybook preset hook: installs Hozo before framework transform plugins.
 *
 * Options are forwarded whole. Naming them one by one -- which this did --
 * meant every option added to `@hozo/vite` afterwards was accepted here,
 * type-checked here, and then dropped on the floor.
 *
 * Not when the config already has Hozo. Storybook's Vite builder loads the
 * project's `vite.config.*`, so a Vite project with `hozo()` in it hands
 * this hook a config that already compiles with Hozo (measured: two `hozo`
 * plugins in the resolved config before this check, one after). Two are
 * not always harmless: `examples/login-demo` built with two lost ten CSS
 * rules, among them the scroll-view and pointer-events bases, though
 * `examples/storybook-demo`'s output was the same either way. The
 * project's own `hozo()` and its options stand.
 */
export function viteFinal(config: UserConfig, options: HozoStorybookOptions = {}): UserConfig {
  if (hasHozo(config.plugins)) return config
  return {
    ...config,
    plugins: [hozo(options), ...(config.plugins ?? [])],
  }
}
