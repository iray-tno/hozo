---
"@hozo/compiler": patch
---

The `not-*` forms of interaction states (`not-focus:`, `not-active:`, `not-disabled:`), element selectors (`not-empty:`, `not-ltr:`) and media queries (`not-sm:`, `not-dark:`, `not-motion-safe:`) now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. `not-hover:` still does. The ordering policy is now `scalar-order-v45`.
