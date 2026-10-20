---
title: "Components"
description: "@hozo/ui: a styled component library, shipped as source and compiled by your own build."
sidebar:
  order: 0
  label: "Overview"
---

`@hozo/ui` is a component library with a look. It is **shipped as source**:
the TSX in `node_modules` goes through the same Hozo build as your own
components, so its classes resolve against your theme and its CSS lands in
your build's output. There is no prebuilt stylesheet to import.

```sh
pnpm add @hozo/ui
```

Then, next to `@import "tailwindcss"` in the stylesheet Hozo reads your
tokens from:

```css
@import "tailwindcss";
@import "@hozo/ui/theme.css";
```

That file is an `@theme` block and nothing else: `bg-hozo-accent`,
`rounded-hozo-control` and the rest. Redefining one of them, below the import,
re-themes every component that uses it.

## The previews on these pages

Each page renders the component live, so you can press, type and open it
here. The previews use `@hozo/ui`'s own theme, not this site's colours, and
follow your system's light or dark setting the way the components do in an
app. The docs' theme switch does not change them.

Every component in the package, with every state, is also in the
[Storybook](../../../storybook/).
