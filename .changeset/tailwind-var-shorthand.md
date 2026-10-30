---
'@hozo/compiler': patch
---

Tailwind v4's variable shorthand now reaches the candidate stylesheet from a class string: `h-(--panel)`, `md:w-(--x)`, and the hinted `bg-(color:--brand)` and `text-(length:--size)`. The scanner used to cut the class at its `(`, so it emitted nothing and said nothing. A `length` hint on `text-` is also read now: `text-[length:var(--s)]` was a colour, and is a font size.
