---
"@hozo/compiler": patch
---

`filter-none` and `backdrop-filter-none` now participate in Tailwind's cascade without leaving unrelated utilities in authored order. For example, swapping `active:p-2` and `hover:p-4` alongside `filter-none` no longer changes which padding wins.
