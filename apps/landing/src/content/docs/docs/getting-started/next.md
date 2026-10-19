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
