---
'@hozo/compiler': patch
---

Refuse unresolvable and invalid arbitrary `fill-[...]` and `stroke-[...]` color strings (`var(...)`, `calc(...)`, lengths, keywords like `auto`, or invalid tokens) on `@hozo/canvas` shapes with `CANVAS_CLASS_NOT_LOWERED` instead of emitting inert paint attributes.
