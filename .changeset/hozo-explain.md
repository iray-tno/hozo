---
"@hozo/cli": minor
"@hozo/compiler": minor
---

Add `hozo explain [CODE]`. It shows what a diagnostic means, a source that raises it, and the compiler's message for that source. Without a code, it lists every code. It accepts `aria-name-prohibited` as well as `ARIA_NAME_PROHIBITED`, and suggests close matches for an unknown code. `--format json` prints the entry.

`@hozo/compiler` now ships `diagnostics.json`, the catalog `explain` reads. The catalog is generated from the compiler's own documentation of each code and from the conformance cases. `explain` reads only this file, so it compiles nothing and loads no native addon.
