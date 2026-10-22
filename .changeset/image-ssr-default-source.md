---
"@hozo/primitives": patch
---

On the Web, a server-rendered `Image` whose `src` has already failed before hydration (`complete && naturalWidth === 0` when the ref attaches) now falls back to `defaultSource`, both directly and through a compiled spread.
