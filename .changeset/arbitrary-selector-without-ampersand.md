---
"@hozo/compiler": patch
---

An arbitrary variant whose selector has no `&`, such as `[.x]:p-4` or `[:hover]:p-4`, now applies to the element, as `&:is(.x)`, which is how Tailwind v4 reads it. It used to be a rule on every `.x` or hovered element on the page. For the same reason, `group-[.x]:`, `peer-[.x]:`, `in-[.x]:` and `not-[.x]:` now compile, where before they wrote nothing and reported nothing.
