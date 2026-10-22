---
title: "How the packages stack"
description: "Which packages the compiler runs and which your app runs, and how they depend on each other."
sidebar:
  order: 1
---

Hozo's packages divide by *who runs them*: the compiler, or your app at
runtime. The dependency arrows point down, and the bottom depends on nothing:

```
┌───────────────────────────────────────────────────────────────┐
│ @hozo/ui        Looks: classes over the layers below.         │
│                 Shipped as source, compiled by your build.    │
└───────────────────────────────────────────────────────────────┘
                               │
┌───────────────────────────────────────────────────────────────┐
│ @hozo/core      Re-exports, for zero-setup authoring.         │
│                 Owns no implementation.                       │
└───────────────────────────────────────────────────────────────┘
               │                                 │
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Primitives (compiled)        │ │ Patterns (runtime)           │
│ @hozo/primitives             │ │ @hozo/patterns · @hozo/form  │
│ @hozo/semantics              │ │ Dialog · Tabs · Menu ·       │
│ @hozo/typography             │ │ Combobox · Popover · Chip ·  │
│ Lowered by the compiler;     │ │ DatePicker · TextArea …      │
│ listed in docs/primitives.md │ │ Write host elements directly │
└──────────────────────────────┘ └──────────────────────────────┘
               │                                 │
┌──────────────────────────────┐                 │
│ @hozo/engine                 │                 │
│ What compiled output calls   │                 │
│ at runtime: environment,     │                 │
│ animation and class hooks    │                 │
└──────────────────────────────┘                 │
               │                                 │
┌───────────────────────────────────────────────────────────────┐
│ @hozo/behaviors  Accessibility and internationalisation as    │
│                  first-class behaviours: FocusScope ·         │
│                  RovingFocus · LiveRegion · Portal ·          │
│                  FloatingPositioner · usePresence ·           │
│                  HozoI18nProvider. Depends on nothing.        │
└───────────────────────────────────────────────────────────────┘
```

- **Primitives** are what you write: `View`, `Text`, `Heading`, `Meter`, and the rest. The compiler lowers each one to a host element (`<div>`, React Native's `View`) with its classes compiled. A few lower to a small runtime component instead, such as `HozoBadge` or `HozoDialog`, when the element needs structure a single tag cannot carry. Static output is safe for server rendering without `'use client'`.
- **`@hozo/engine`** is the runtime the compiled output calls: environment hooks (`dark:`, `md:`, `motion-safe:`), the animation and keyframe hooks, and the class resolver for classes only known at runtime.
- **Patterns** are stateful widgets that ship as ordinary runtime code. They compose **behaviors over host elements**: `<button>` and `<div>` on the Web, `Pressable` and `View` on React Native. They do not use primitives. Published packages are not run through your compiler, so writing the host elements directly is what keeps their markup and ARIA exactly as designed. The same reason is why their class slots are resolved on the Web and carried on Native, where a pattern takes `style` props for its look.
- **`@hozo/behaviors`** is the base every string-showing and focus-handling package builds on, so accessibility and internationalisation are designed in from the start rather than added at the end ([decision 008](https://github.com/iray-tno/hozo/blob/main/docs/decisions/008-i18n-is-a-connection.md)). The compiler statically removes what is knowable at build time (static initial focus, build-time ARIA IDs, static sibling `inert` for portals).
- **`@hozo/ui`** is a look. Its components are classes over the packages above, shipped as source so your build compiles them with your theme.
- The RFCs and older comments call these Layer 1 (primitives), Layer 2 (behaviors) and Layer 3 (patterns). The numbering reads as if each layer were built from the one below it. Patterns are built on behaviors, not on primitives, which is what this section used to get wrong (#764).
- **Domain, navigation, and migration packages** sit beside this stack as opt-in packages so applications that do not use them carry none of their dependencies:
  - [`@hozo/svg`](../../graphics-and-media/svg/), [`@hozo/canvas`](../../graphics-and-media/canvas/), [`@hozo/three`](../../graphics-and-media/three/), [`@hozo/media`](../../graphics-and-media/media/), and [`@hozo/webview`](../../graphics-and-media/webview/) for graphics, media, and embedded frames.
  - [`@hozo/navigation`](../../reference/navigation/) for router-agnostic links, deep links, and `.well-known` verification files.
  - [`@hozo/native`](../../reference/native/) for Android TalkBack focus restoration.
  - [`@hozo/rn-compat`](../../reference/rn-compat/) and [`@hozo/migration-audit`](../../migration/migration-audit/) for migrating existing React Native applications.
