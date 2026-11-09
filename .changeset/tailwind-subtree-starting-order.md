---
"@hozo/compiler": patch
---

`*:`, `**:` and `starting:` now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. The ordering policy is now `scalar-order-v48`.
