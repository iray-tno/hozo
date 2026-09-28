# @hozo/ui

A styled component library for Hozo, **shipped as source**. Your own Hozo build compiles it, against your own theme.

```tsx
// your CSS entry
@import "tailwindcss";
@import "@hozo/ui/theme.css";
```

```tsx
import { Button } from '@hozo/ui'

<Button tone="accent" onPress={save}>Save</Button>
```

There is no prebuilt stylesheet to import and nothing to override. The TSX in `node_modules` goes through the same compiler your own components do, so its classes resolve against **your** `@theme` and its CSS lands in your build's output.

## What it adds, and what it does not

It composes and it styles. That is all, and it is a rule rather than a description: anything needing a new role, a new keyboard contract or a new state machine goes into `@hozo/patterns` or `@hozo/form` first, with its own Verification Matrix, and this package then wears it.

A styled layer that implements behaviour becomes a second implementation of the same widget — and then the one people actually use is not the one the accessibility work covers. `Button` here is the `Button` primitive with class names on it, which is why it still turns into a `Link` when you give it an `href`.

## Theming

Every colour, radius and shadow is a token in `theme.css`, and **no component writes a palette name or a literal**. Redefine a token and everything that uses it moves:

```css
@import "@hozo/ui/theme.css";

@theme {
  --color-hozo-accent: var(--color-emerald-600);
  --color-hozo-accent-hover: var(--color-emerald-700);
  --radius-hozo-control: var(--radius-full);
}
```

The tokens are custom properties rather than a JavaScript object, so they are the same Theme IR a future StyleX frontend would read rather than a second copy of it (see [#156](https://github.com/iray-tno/hozo/issues/156)).

Their values are literals rather than `var(--color-slate-600)` references, which would read better and be dropped: `/tailwind` converts each `--color-*` it finds and leaves out what will not convert, and a `var()` chain is not a colour to that converter. The palette entry each token came from is in a comment beside it.

The palette was not designed. It was counted: `examples/storybook-demo` had grown a consistent look by hand, and the tokens are its most-used values promoted — `text-slate-900` in 120 places, `border-slate-200` in 100, `indigo-600` as the accent in 27. `theme.css` records which is which.

One thing the inventory found that this package fixes by construction: the demo had a focus ring on four controls and nothing on most of the rest. Here the ring is part of the only class list an interactive component can have.

## Class names are written out on purpose

Every component's class list is a complete literal chosen by a `switch`, not assembled at runtime. Two tools have to read them and neither runs the code — Tailwind's scanner, to emit the CSS, and Hozo's compiler, which resolves a `className` it can read statically and falls back to the project-wide candidate sheet for one it cannot. A library whose own classes took the fallback path would be arguing against itself.

Consumers need `node_modules/@hozo/ui/src` inside their Tailwind content globs for the same reason.

## Status

Early. `Button` and the token set are here; `Card`, `Stack`, `Field` and the rest are tracked in [#638](https://github.com/iray-tno/hozo/issues/638), which also carries the open questions — dark mode strategy, and where `examples/storybook-demo` ends and this package begins.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
