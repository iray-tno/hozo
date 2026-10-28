---
'@hozo/patterns': patch
---

`CodeBlock` takes `windowing: 'auto' | 'on' | 'off'`. With `maxHeight`, `'auto'` (the default) now windows only past 100 lines, and a shorter block scrolls with every line mounted.
