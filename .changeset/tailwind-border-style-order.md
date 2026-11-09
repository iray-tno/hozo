---
"@hozo/compiler": patch
---

Written border styles (`border-dashed`, `border-dotted`, `border-solid`, `border-none`) now settle in Tailwind's order. The `solid` a border width implies now never overrides a written style, whatever the order or condition, as in Tailwind: on Web it is emitted in a zero-specificity `:where()` rule, and on Native it is no longer written (React Native's default is already `solid`). `border-dashed md:border-4` used to turn solid at `md`. The ordering policy is now `scalar-order-v49`.
