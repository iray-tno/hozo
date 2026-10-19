---
title: "Troubleshooting"
description: "The traps people hit first, with the message you see and what to change."
---

## `does not provide an export named 'transformWithOxc'`

You are on Vite 6 or 7. `@hozo/vite` (and `@hozo/storybook`, which wraps it)
needs **Vite 8 or newer**. See [Vite](../getting-started/vite/).

## Android on React Native 0.87: stale text, buttons that stop responding

Logcat says `Unable to find viewState for tag N`. This is not Hozo's bug:
React Native 0.87 resolves androidx.collection 1.4.0–1.4.2, which can lose
entries. Pin `androidx.collection:collection:1.4.4`. See
[Metro](../getting-started/metro/).

## Tailwind utilities lose to a reset

If your stylesheet already imports Tailwind, it has its own preflight inside
`@layer base`, and Hozo's unlayered copy beats your utilities. Pass
`preflight: false` to the integration.

## A box lays its children out in a column, not a row

`className="flex"` does not make a row. Hozo's boxes follow React Native,
where the direction is column. Write `flex-row`. The compiler warns with
`FLEX_DIRECTION_UNSAID`. See [A box is a column](../guides/layout/).

## On React Native, `hover:`, `active:` or `disabled:` do nothing through `cn()`

A project helper such as shadcn/ui's `cn` is followed to its file and read
when it only wraps `clsx`, `classnames`, `tailwind-merge` or `cx`. Anything
else needs declaring with `classHelpers`, or the call takes the runtime
fallback, which cannot carry state styles on Native. See
[How styles are resolved](../guides/styles/).

## A class name built at runtime has no style

`` `bg-${color}-500` `` is not written in any source file, so the build never
sees it and emits no rule. Write the full class names somewhere the build can
read them, for example in an object that maps each colour to its class.

## Something else

Run the audit over the whole project and read its findings, each with a file,
a line and a code:

```sh
npx @hozo/migration-audit . --format json
```

See [Reading what the compiler says](../guides/diagnostics/). If that does not
explain it, [open an issue](https://github.com/iray-tno/hozo/issues/new).
