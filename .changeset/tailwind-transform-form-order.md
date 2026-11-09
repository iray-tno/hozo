---
"@hozo/compiler": patch
---

The transform resets (`translate-none`, `scale-none`, `rotate-none`, `transform-none`), `scale-3d`, `scale-z-*` and `transform`/`transform-gpu` now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. On Web a reset written after the axes now turns the property off (`scale-none` after `scale-50` used to keep the scale), and `scale` takes its three-value form only when a z-form utility is the last to write it. The ordering policy is now `scalar-order-v52`.
