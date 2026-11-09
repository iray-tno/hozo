---
"@hozo/compiler": patch
---

`drop-shadow-none` and `via-none` now settle in Tailwind's order. A drop-shadow colour now brings the size's shadow back after `drop-shadow-none`, as in Tailwind; `md:drop-shadow-none` now writes a valid `filter: none` on Web instead of an empty declaration that left the shadow standing; and a conditional `via-none` now composes through the gradient registers on Web. The ordering policy is now `scalar-order-v55`.
