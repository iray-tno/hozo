---
"@hozo/metro": patch
---

Imports from `@hozo/engine` are now rewritten to the modules that define each name, like the other Hozo barrels. `@hozo/primitives` and `@hozo/typography` import from it, so every Native app was loading the engine's whole entry, the Web-only DOM helpers included: 40.8 KB of the demo's dev bundle.
