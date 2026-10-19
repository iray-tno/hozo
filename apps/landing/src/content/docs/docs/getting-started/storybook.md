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
