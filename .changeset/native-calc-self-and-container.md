---
"@hozo/compiler": patch
"@hozo/primitives": patch
"@hozo/core": patch
---

Support CSS math expressions (`calc()`, `min()`, `max()`, `clamp()`) for viewport units (`vw`/`vh`/`vmin`/`vmax`), `@container` units (`cqw`/`cqh`/`cqi`/`cqb`/`cqmin`/`cqmax`), and self-measured React Native boxes (`translate*`, `rounded*`, `gap*`, and `HozoGrid` column tracks) via opt-in `onLayout` without wrapper Views.
