---
"@hozo/compiler": minor
"@hozo/engine": minor
---

On React Native, a physical inline utility on its own (`pl-4`, `mr-2`, `left-3`, `border-l-2`) now keeps its side in RTL, as in Tailwind. Before, React Native's default left/right swap moved it to the other side. Where the swap would change the result, both the static compiler and the generated candidate map emit the edge as `start`/`end` for the current direction, so the result no longer depends on the swap setting. A utility that writes both sides alike (`p-4`) is unchanged.

This changes behaviour for an RTL app that relied on the swap to mirror physical classes. To mirror, use the logical classes (`ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`).
