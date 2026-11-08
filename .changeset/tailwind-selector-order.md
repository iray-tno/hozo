---
"@hozo/compiler": patch
---

In a captured Tailwind project, variants that are a condition on the element itself now settle in Tailwind's order, whichever is written first: `rtl:`, `ltr:`, `first:`, `last:`, `odd:`, `nth-*:`, `only:`, `empty:`, the form and control states such as `required:` and `checked:`, `data-*:`, `open:` and `inert:`. `rtl:p-4 p-2` used to keep `p-2` on a right-to-left page. The ordering policy is now `scalar-order-v10`.
