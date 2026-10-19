---
title: "Astro"
description: "Add Hozo to an Astro site through its Vite plugin."
sidebar:
  order: 4
---

Astro builds with Vite, so Hozo's Vite plugin is all an Astro project needs.
This documentation site is itself Astro with `@hozo/vite`, and
[examples/astro-demo](https://github.com/iray-tno/hozo/tree/main/examples/astro-demo)
is the smallest working setup, checked on every change.

```sh
npm install --save-dev @hozo/vite @hozo/compiler
npm install @hozo/core @astrojs/react react react-dom
```

```js
// astro.config.mjs
import react from '@astrojs/react'
import { hozo } from '@hozo/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [react()],
  vite: {
    // First: Hozo has to see the source as written, before any other
    // plugin transforms it.
    plugins: [hozo({ css: 'src/theme.css' })],
  },
})
```

`css` names the stylesheet that holds your design tokens. Hozo reads it; it
does not have to be imported anywhere:

```css
/* src/theme.css */
@import "tailwindcss";

@theme {
  --color-brand: oklch(62% 0.19 258);
}
```

Astro's TypeScript preset leaves JSX to Astro, so tell it the `.tsx`
components use React. Without this, the build fails with
`React is not defined`:

```json
// tsconfig.json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "react" }
}
```

## Three things to know

- **Primitives go in `.tsx` components and `.mdx` pages, not in `.astro`
  templates.** Hozo compiles JSX. An `.astro` file can import and render a
  `.tsx` component built from primitives, and an `.mdx` page can use
  primitives inline.
- **A component built only from static primitives ships no JavaScript.**
  Astro renders it at build time with no `client:` directive, and Hozo has
  already turned it into HTML and a stylesheet. A component with an event
  handler or a stateful pattern needs a `client:` directive like any other
  React island; without one, Astro renders it and drops the handler.
- **Beside `@tailwindcss/vite`, pass `preflight: false`.** If your own
  stylesheet already imports Tailwind, the page already has Tailwind's
  preflight, and Hozo's would be a second copy of it. Write
  `hozo({ preflight: false })`, and put `hozo()` before `tailwindcss()`
  in `vite.plugins`.
