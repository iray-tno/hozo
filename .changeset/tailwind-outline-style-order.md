---
"@hozo/compiler": patch
---

Written outline styles (`outline-dashed`, `outline-dotted`, `outline-solid`) now settle in Tailwind's order, and the `solid` an outline width implies never overrides one, whatever the order or condition: zero specificity on Web, not written on Native (its default is already `solid`). `outline-dashed focus:outline-2` used to turn solid on focus. The ordering policy is now `scalar-order-v50`.
