---
"@hozo/patterns": patch
---

`Tooltip` on the Web renders in the top layer, so a fixed or positioned neighbour such as a sidebar no longer paints over it. `className` and `style` now apply to a box inside the positioner, around the `role="tooltip"` label, because the top-layer positioner resets its own background and padding.
