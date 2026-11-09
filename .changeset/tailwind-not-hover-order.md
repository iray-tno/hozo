---
"@hozo/compiler": patch
---

`not-hover:` now settles in Tailwind's order, and no longer keeps the rest of its class list in authored order. On Web this also fixes a device that cannot hover: in `not-hover:p-2 p-4` the `@media not (hover: hover)` branch used to come before `p-4` and lose to it. The ordering policy is now `scalar-order-v51`.
