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

These steps start from Vite's React starter
(`npm create vite@latest my-app -- --template react-ts`) and are built in CI
exactly as written here, from packed packages.

```sh
npm install --save-dev @hozo/vite @hozo/compiler
npm install @hozo/core
```

```ts title="vite.config.ts"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { hozo } from '@hozo/vite'

export default defineConfig({
  // `hozo()` before `react()`: it has to see the original JSX, before
  // the React plugin's transform touches the file.
  plugins: [hozo({ css: 'src/theme.css' }), react()],
})
```

`css` names the stylesheet that holds your design tokens. Hozo reads it; it
does not have to be imported anywhere:

```css title="src/theme.css"
@import "tailwindcss";

@theme {
  --color-brand: oklch(62% 0.19 258);
}
```

## Your first component

Write components with Hozo's primitives and Tailwind classes. The build turns
them into HTML elements and a stylesheet:

```tsx title="src/App.tsx"
import { Button, Heading, View } from '@hozo/core'
import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)
  return (
    <View className="gap-4 p-8">
      <Heading level={1} className="text-3xl font-bold text-brand">
        Hello, Hozo
      </Heading>
      <Button
        className="self-start rounded-lg bg-brand px-4 py-2 text-white"
        onPress={() => setCount(count + 1)}
      >
        Pressed {count} times
      </Button>
    </View>
  )
}
```

Run `npm run dev`. The heading is an `<h1>`, the button a `<button>`, and
their classes are plain CSS.
