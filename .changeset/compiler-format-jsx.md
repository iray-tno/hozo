---
"@hozo/compiler": minor
"@hozo/cli": minor
---

`@hozo/compiler/format-jsx` exports `formatJsx`, which lays out compiled JSX one element per line for a person to read. The compiler's own output stays on one line, so source positions hold. `hozo show` now prints its JSX through it, laid out the same way as the REPL's panes.
