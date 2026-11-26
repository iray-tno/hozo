---
"@hozo/charts": patch
---

Moving the active datum no longer rebuilds the layout, the table and every mark: a step
takes one frame at 20,000 values, where it took about 64 ms.
