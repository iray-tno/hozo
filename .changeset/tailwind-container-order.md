---
"@hozo/compiler": patch
---

`container` now settles in Tailwind's order, and no longer keeps the rest of its class list in authored order. A later unprefixed `max-w-*` now wins at every width, as in Tailwind, where `container max-w-5xl` used to take the container's width at each breakpoint. The ordering policy is now `scalar-order-v56`.
