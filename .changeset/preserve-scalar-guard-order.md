---
"@hozo/compiler": patch
---

Preserve authored order for overlapping static hover, focus and press rules that set physical padding, margin or opacity when the class list cannot be ranked. A later write under a repeated state no longer moves before a competing rule of equal specificity.
