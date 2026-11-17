---
title: "TanStack Start"
description: "Add Hozo to a TanStack Start app."
sidebar:
  order: 6
---

TanStack Start builds with Vite, so it takes `@hozo/vite`:

```sh
npm install --save-dev @hozo/vite @hozo/compiler
npm install @hozo/core
```

The plugin goes first in the list, before any plugin that transforms the
source:

```ts
import { hozo } from '@hozo/vite'

export default defineConfig({
  plugins: [hozo({ css: 'src/theme.css' }), tanstackStart(), viteReact(), nitro()],
})
```

## Tailwind already in the project

TanStack's starters add Tailwind through `@tailwindcss/vite`, with
`src/styles/app.css` importing it. Point `css` at that stylesheet, put
`hozo()` before `tailwindcss()`, and turn Hozo's preflight off, since
Tailwind already emits one:

```ts
export default defineConfig({
  plugins: [
    hozo({ css: 'src/styles/app.css', preflight: false }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    nitro(),
  ],
})
```
