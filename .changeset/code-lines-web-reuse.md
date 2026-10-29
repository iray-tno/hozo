---
'@hozo/typography': patch
'@hozo/patterns': patch
---

A Web `CodeBlock` or `CodeLines` no longer redraws the lines an update left alone, as on Native: a line passed again as the same object keeps its row.
