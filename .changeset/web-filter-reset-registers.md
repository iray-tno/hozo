---
"@hozo/compiler": patch
---

On Web, a later active filter or backdrop-filter utility restores existing Tailwind function values after a whole-property reset. For example, `blur-sm filter-none hover:sepia` is still off at rest but now applies both blur and sepia while hovered.
