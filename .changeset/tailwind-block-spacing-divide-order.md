---
"@hozo/compiler": patch
---

Block-logical spacing (`pbs-*`, `pbe-*`, `mbs-*`, `mbe-*`), divider widths and colours (`divide-x`, `divide-y-*`, `divide-<colour>`) and the `space-*-reverse`/`divide-*-reverse` flags now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. A divider style (`divide-dashed`) still does. The ordering policy is now `scalar-order-v44`.
