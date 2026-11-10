---
"@hozo/compiler": patch
---

Divider styles (`divide-dashed`, `divide-dotted`, `divide-solid`, `divide-none`) now settle in Tailwind's order, and the `solid` a divider width implies never overrides a written one, whatever the order or condition: on Web it moves to `@layer base`, and on Native it is no longer written. The ordering policy is now `scalar-order-v53`.
