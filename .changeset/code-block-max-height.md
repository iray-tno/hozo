---
'@hozo/patterns': patch
---

`CodeBlock` takes `maxHeight`: longer content scrolls inside the block. On React Native only the lines near the visible ones are mounted (#1289), and the widest line is drawn once, at no height, so a block that scrolls sideways is still as wide as its widest line. The Web keeps every line in the page.
