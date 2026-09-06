# Login Demo

End-to-end Vite and React web demonstration for Hozo.

## Overview

This example demonstrates how Hozo compiles universal primitives into semantic HTML5 DOM and CSS in a standard Vite application:

- Imports `@hozo/core` primitives (`View`, `Text`, `Heading`, `Paragraph`, `Pressable`, `Button`, `TextInput`).
- Transforms Tailwind v4 utility classes and conditional `className` bindings into real scoped CSS classes at build time.
- Verifies server-side rendering (SSR) compatibility and client hydration without shipping runtime style machinery.
- Runs `@hozo/vite` before `@vitejs/plugin-react` to lower JSX directly.

## Development

```sh
pnpm --filter @hozo/compiler build:native # build native addon first
pnpm --filter login-demo dev              # start Vite development server
pnpm --filter login-demo build            # production client and SSR build
pnpm --filter login-demo test             # run build verification tests
```
