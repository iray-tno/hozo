---
title: "Next.js"
description: "Add Hozo to a Next.js project, on Turbopack or webpack."
sidebar:
  order: 2
---

Works with both bundlers — Turbopack (the default from Next 16) and
`next build --webpack`.

```sh
npm install --save-dev @hozo/next @hozo/compiler
npm install @hozo/core
```

```ts
// next.config.ts
import { withHozo } from '@hozo/next'

export default withHozo({ /* your Next config */ }, { css: 'src/theme.css' })
```

`create-next-app` writes `const nextConfig = { … }` and exports it; wrap that
export, `export default withHozo(nextConfig, { … })`, and keep the rest.

## Which stylesheet

Pass `css` even when the default would find something. `create-next-app`'s
`app/globals.css` is on the list Hozo looks for, and without Tailwind it
holds no `@import "tailwindcss"`: Hozo would read it, find no theme, and
compile against Tailwind's defaults. Point `css` at a stylesheet that has
the import, as the [Vite guide's](../vite/) `src/theme.css` does.

## Tailwind already in the project

If the project was created with Tailwind, `app/globals.css` already imports
it and `@tailwindcss/postcss` already emits Tailwind's preflight. Use that
stylesheet, and turn Hozo's preflight off so the page gets one copy:

```ts
export default withHozo(nextConfig, { css: 'app/globals.css', preflight: false })
```
