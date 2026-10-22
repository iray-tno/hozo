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

## The React Native line under each preview

Under each preview is one line on what React Native makes of the same
component's look. The compiler writes it: it reads every class the
component's source gives its parts, including the class lists it hands to
`@hozo/patterns`, and lists the ones React Native has no equivalent for, with
the reason. A `before:` marker, a `backdrop:` scrim and `overflow-y-auto` are
typical. A cursor shape or a CSS transition is counted separately, because a
touch screen does without it.

It also lists the class props the component's React Native half accepts and
does not apply yet -- the TimePicker's `periodClassName`, for example. That
part of the look is missing there however drawable its classes are. Only a
prop that is never used counts; one the Native half might pass on is not
listed.

What it does not say:

- **It is about classes, not behaviour.** A component can behave differently
  on React Native for reasons no class shows; the components' pages describe
  those where they are known.
- **State classes are not judged.** `hover:`, `aria-selected:` or
  `data-[state=open]:` work on React Native when the component's Native half
  hands that state to its styles, which varies by component.
- **It is not a screenshot.** Nothing here was run on a device to produce it.

## The Android and iOS screenshots

Under the line, where they exist, is the demo as it looked in the last run
on `main`: on an Android emulator and on an iOS simulator, each with the date
and commit it was taken at. They show what the line cannot: layout, and
anything that is wrong for a reason other than a class. If the demo threw an
error on a platform, that platform's screenshot is of the error, and says
so. A page with no screenshot for a platform had none in that run. Either
the run did not reach it, or the site was built without one.
