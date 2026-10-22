---
title: "Tailwind CSS"
description: "How Hozo reads a Tailwind v4 stylesheet and compiles utilities to scoped CSS on the Web and StyleSheet objects on React Native."
sidebar:
  order: 2
---

Hozo's primary styling frontend is Tailwind CSS v4. You write standard utility classes on Hozo primitives (`View`, `Text`, `Pressable`, `Heading`, and the rest), and the Rust compiler lowers them at build time into scoped CSS rules on the Web and `StyleSheet` objects on iOS and Android.

## Reading your `@theme` through Tailwind's own resolver

Tailwind v4 defines design tokens in CSS — `@theme { --color-brand: oklch(62% 0.19 258); }` — alongside `@import`, `@plugin`, and cascade layers. Parsing that file with regexes or a hand-rolled CSS reader would disagree with Tailwind as soon as an `@import` chain or colour function was involved.

Instead, `@hozo/tailwind` runs your entry stylesheet through Tailwind's own resolver once per build and hands the resolved theme table to the compiler:

```css
/* src/theme.css */
@import "tailwindcss";
@import "@hozo/ui/theme.css";

@theme {
  --color-brand: oklch(62% 0.19 258);
  --radius-control: 10px;
}
```

```ts
// vite.config.ts
import { hozo } from '@hozo/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [hozo({ css: 'src/theme.css' })],
})
```

Three details of that resolution matter across platforms:

- **Colours come back in three forms:** the token name, the authored `oklch()` value, and a precomputed hex fallback. Web CSS emits the modern colour or CSS variable reference; React Native has no `oklch()` parser, so the Native backend receives the converted sRGB/hex value automatically.
- **Spacing stays a scale step, not frozen pixels:** `p-4` means four units of `--spacing`. Keeping the step until lowering means a project that changes `--spacing` moves its spacing scale as a unit rather than baking `0.25rem` into the theme loader.
- **Radius tokens resolve at compile time on both platforms:** overriding `--radius-lg: 10px` or defining `--radius-control: 10px` makes `rounded-lg`, `rounded-t-lg`, and `rounded-control` emit `10px` on Web and `borderRadius: 10` on React Native. Bare `rounded`, `rounded-none`, `rounded-full`, and arbitrary values such as `rounded-[8px]` keep their explicit meanings.

## Variants across Web and React Native

On the Web, variants compile to real CSS selectors and media queries (`:hover`, `:focus-visible`, `@media (min-width: 768px)`, `@media (prefers-color-scheme: dark)`).

On React Native, there is no selector engine. Hozo bridges variants through two mechanisms:

1. **Interaction states (`hover:`, `active:`, `focus:`, `focus-visible:`, `disabled:`):** lowered into state callbacks on interactive primitives (`Pressable`, `Button`, `Link`, `TextInput`) and into registered style-slot callbacks on `@hozo/patterns` and `@hozo/form` widgets.
2. **Environment conditions (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`, `dark:`, `motion-safe:`, `motion-reduce:`, `portrait:`, `landscape:`):** lowered to subscribe to `@hozo/engine`'s shared runtime environment hooks (`useHozoEnv`) only when a component actually uses one of those variants. A component with no responsive or dark classes subscribes to nothing.

## Layout features React Native does not have natively

Several CSS layout features have no direct React Native `StyleSheet` property. Rather than dropping them silently, the Native backend lowers supported static subsets to small generated runtime wrappers in `@hozo/primitives/generated/*`:

- **CSS Grid (`grid`, `grid-cols-*`, `col-span-*`, `gap-*`):** lowered to `HozoGrid` and `HozoGridItem` on React Native for static `fr`, `px`, and `minmax(px, fr)` tracks.
- **Container queries (`@container`, `@md:...`):** lowered to `HozoContainer`, measuring the container's layout width via `onLayout`.
- **Child spacing (`space-x-*`, `space-y-*`, `divide-*`):** lowered to child-spacing helpers when static children require separator margins or borders.
- **Transitions (`transition-*`, `duration-*`, `ease-*`):** lowered to `Animated` interpolation on React Native for numeric transform and opacity properties.
- **Relative typography (`text-sm`, `text-lg`, `em`, `Heading`, `Small`):** propagated through Hozo's inherited text frame so nested `Text` nodes scale relative to their parent as they do in CSS.

## When React Native cannot draw a class

When a utility uses a CSS capability that React Native has no equivalent for — such as `before:block`, `backdrop:bg-black/50`, `float-left`, `columns-2`, or `scroll-snap-type` — Hozo does not pretend it worked:

- **In the compiler:** the Native backend emits `WEB_ONLY_PROPERTY_ON_NATIVE` (or `UNSUPPORTED_CLASS_ON_NATIVE`), naming the class and the reason.
- **In `/docs/components/`:** every `@hozo/ui` component page runs `nativeClassReport` over the component's source and prints the exact classes React Native cannot draw under the preview.

## Programmatic theme loading

Build integrations call `@hozo/tailwind` automatically. Tools that inspect a project outside a bundler can call it directly:

```ts
import { loadProjectTheme, loadStaticProjectTheme } from '@hozo/tailwind'

// Full Tailwind v4 resolver (used by Vite, Metro, Next, and Storybook integrations)
const theme = await loadProjectTheme(projectRoot, {
  css: 'src/theme.css',
  warn: (message) => console.warn(message),
})

// Read-only structural analysis with content hashes (used by @hozo/migration-audit)
const staticTheme = await loadStaticProjectTheme(projectRoot, 'src/theme.css')
```

`loadStaticProjectTheme` parses entry and imported CSS structurally without executing `@plugin`, `@config`, or remote stylesheets, recording content hashes so migration audits can verify whether two runs shared the exact same theme inputs.

## See it live

- **[How styles are resolved](../styles/):** the three compilation tiers (static, structurally conditional `cx`/`cn`, and the candidate stylesheet fallback).
- **[Tailwind, compiled](../../../tailwind/):** interactive side-by-side view of one component's TSX, generated Web CSS, and React Native `StyleSheet` output.
- **[Conformance Matrix](../../../conformance/):** live differential count of every Tailwind v4 utility tested against Tailwind's own engine and React Native's schema.
