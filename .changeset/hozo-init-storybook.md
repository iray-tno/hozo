---
"@hozo/cli": patch
---

`hozo init` adds `@hozo/storybook` to a Vite-based Storybook's `addons`, with `css` in its options. Storybook beside a Vite config is left alone, because Storybook builds with that config and its `hozo()` already; a Storybook framework that does not build with Vite is refused.
