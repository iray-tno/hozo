---
'@hozo/compiler': patch
---

Compile Tailwind's `open:` variant, so `group-open:` and `peer-open:` override a compiled base such as `hidden` inside an open `Details`. Written on a primitive itself, `open:` is reported as `TAILWIND_VARIANT_CANNOT_MATCH`; on Native it is reported as not wired.
