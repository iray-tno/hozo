---
'@hozo/compiler': patch
'@hozo/tailwind': patch
---

`font-sans`, `font-serif` and `font-mono` now follow the project's `--font-*` theme tokens instead of always compiling to Tailwind's default stacks. On Web they write `var(--font-mono)`, as Tailwind does, and the variable is delivered with the project's value. An `inline` theme token is written out. Native gets the token's value. Without a theme, the default stacks are unchanged.
