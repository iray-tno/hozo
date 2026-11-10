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

## A box lays its children out in a column, not a row

`className="flex"` does not make a row. Hozo's boxes follow React Native,
where the direction is column. Write `flex-row`. The compiler warns with
`FLEX_DIRECTION_UNSAID`. See [A box is a column](../guides/layout/).

## On React Native, `hover:`, `active:` or `disabled:` do nothing through `cn()`

A project helper named in a `className` is followed to its file and read
when it wraps `clsx`, `classnames`, `cx`, `twJoin` or `twMerge` (including
shadcn/ui's `cn`, whose conflict resolution is compiled into per-group guards
so a caller's `px-2` still replaces the component's `px-3`). A helper behind
an alias the bundler cannot resolve, or one that wraps a custom
`extendTailwindMerge` / `createTailwindMerge` configuration, takes the
runtime fallback unless declared with `classHelpers`. See
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
