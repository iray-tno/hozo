---
title: "Storybook"
description: "Add Hozo to Storybook with one addon."
sidebar:
  order: 5
---

Zero configuration beyond the addon — it wraps `@hozo/vite`. It inherits that
plugin's floor: **Vite 8 or newer**.

```sh
npm install --save-dev @hozo/storybook
```

```ts
// .storybook/main.ts
export default {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@hozo/storybook'],
}
```

**In a Vite project that already has `hozo()`, the addon is not needed.**
Storybook's Vite builder loads your `vite.config`, plugins included, so
Storybook already compiles with Hozo and with that config's options. The
addon sees `hozo()` there and steps aside; it is for a Storybook with no
Vite config of its own. To pass options through the addon, write
`{ name: '@hozo/storybook', options: { css: 'src/theme.css' } }`.
