---
"@hozo/compiler": patch
---

`animate-*` and the `placeholder-*` colour utility now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. On Native, the last animation written under a condition now runs, as on Web, rather than the first. The ordering policy is now `scalar-order-v42`.
