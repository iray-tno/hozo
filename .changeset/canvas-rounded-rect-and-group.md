---
"@hozo/compiler": minor
"@hozo/canvas": minor
---

Lower uniform `rounded-*` utilities to `radius` on `Canvas.RoundedRect` and lower `opacity-*` plus 2D `translate-*`, `scale-*`, and `rotate-*` utilities to `opacity` and `transform` props on `Canvas.Group` (with optional `className` typing on `GroupProps`).