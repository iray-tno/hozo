---
'@hozo/compiler': minor
---

Lower Tailwind `flex-<n>/<d>` fractions (`flex-1/2`, `flex-2/3`, etc.) and single-value arbitrary `<length-percentage>` `flex-[...]` shorthands (`flex-[10px]`, `flex-[2rem]`, `flex-[50%]`) on React Native to `{ flexGrow: 1, flexShrink: 1, flexBasis }` per CSS Flexbox Level 1 §7.1.1, with zero runtime cost.
