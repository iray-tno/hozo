---
title: "A box is a column"
description: "Why `flex` alone does not give you a row, and what to write instead."
sidebar:
  order: 2
---

The one thing a Web developer trips over. In a browser, `display: flex` on a `<div>` lays its children out in a **row**, because that is CSS's initial value. Hozo's boxes are not `<div>`s — they lower to a React Native `View`, whose direction is **column**, and the Web base follows React Native rather than the other way round. `react-native-web` makes the same choice, and applies it to `<nav>` and `<section>` as well as to `<div>`.

```tsx
<View className="flex items-center justify-between">   // a column, on both platforms
<View className="flex-row items-center justify-between">  // a row
```

So `className="flex"` on a box is two things at once: redundant, because the box is already a flex container, and usually a defect, because the person who typed it was picturing a row. The compiler says so — `FLEX_DIRECTION_UNSAID` — and the fix is one word: `flex-row` for a horizontal layout, `flex-col` to record that the column was meant, or drop `flex` entirely.

A direction written under any variant counts as having said so, so `flex md:flex-row` is quiet.

This applies to every primitive that becomes a React Native `View` — `View`, `Section`, `Article`, `Nav`, `Main`, `Header`, `Footer`, `Aside`, `Search`, `Figure`, `Address`, `Fieldset`, `List`, `ListItem` and the description-list pair. `Text` is a React Native `Text` and keeps CSS's own default, so nothing is said about it.
