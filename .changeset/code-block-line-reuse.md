---
'@hozo/typography': patch
'@hozo/patterns': patch
---

A Native `CodeBlock` or `CodeLines` no longer redraws the lines an update left alone: a line passed again as the same object keeps its row. Changing one line of a 1000-line block re-rendered every mounted line before.
