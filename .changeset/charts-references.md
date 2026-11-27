---
"@hozo/charts": minor
---

Add `references` to every chart with a value axis: `{ value, label }` draws a dashed line, for example
a target, and `{ value, to, label }` shades a range. The axis widens to show them. The summary reads
each one after the series, for example "Target: $150.", so a reader is not left with only the
drawing.
