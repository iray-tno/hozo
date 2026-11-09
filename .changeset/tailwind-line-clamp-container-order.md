---
"@hozo/compiler": patch
---

`line-clamp-*` and `@container` now settle in Tailwind's order. On Web a line clamp's `display`/`overflow` are now emitted where the clamp is, so `line-clamp-2 flex` is `display: flex` as in Tailwind, rather than always `-webkit-box`. The ordering policy is now `scalar-order-v46`.
