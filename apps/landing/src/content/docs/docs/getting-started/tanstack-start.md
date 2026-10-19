---
title: "TanStack Start"
description: "Add Hozo to a TanStack Start app."
sidebar:
  order: 6
---

The Vite plugin, first in the list:

```ts
export default defineConfig({
  plugins: [hozo({ css: 'src/theme.css' }), tanstackStart(), viteReact(), nitro()],
})
```
