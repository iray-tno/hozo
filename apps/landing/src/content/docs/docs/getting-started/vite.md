---
title: "Vite"
description: "Add Hozo to a Vite 8 project."
sidebar:
  order: 1
---

Requires **Vite 8 or newer**. The plugin calls Vite's own `transformWithOxc`,
which Vite 6 and 7 do not export -- on those the build fails at config load
with `does not provide an export named 'transformWithOxc'`, naming neither
Vite nor its version.

```sh
npm install --save-dev @hozo/vite @hozo/compiler
npm install @hozo/core
```

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { hozo } from '@hozo/vite'

export default defineConfig({
  // `hozo()` before `react()`: it has to see the original JSX, before
  // the React plugin's transform touches the file.
  plugins: [hozo({ css: 'src/theme.css' }), react()],
})
```
