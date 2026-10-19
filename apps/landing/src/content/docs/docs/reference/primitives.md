---
title: "Primitives"
description: "Every primitive, and what it becomes on the Web and on React Native."
---

[`docs/primitives.md`](https://github.com/iray-tno/hozo/blob/main/docs/primitives.md) lists all 54, with what each one compiles to on the Web and on React Native and which conformance case pins it. It is **generated** — `pnpm docs:primitives` — by compiling one snippet per primitive through both backends, so it cannot describe a lowering the compiler does not do. Adding a primitive without a snippet or a doc comment fails rather than leaving a hole, and CI checks the page is current.

The half worth reading is where a role has to be written on one side and not the other: 17 of the 54. A `<nav>` is a navigation landmark because it is a `<nav>`; React Native has no elements, so every role it keeps is one the compiler put there — and the ones it has no word for are the ones genuinely lost.
