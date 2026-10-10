---
"@hozo/metro": minor
---

`@hozo/metro` now rewrites named imports from Hozo's barrels (`@hozo/core`, `@hozo/patterns` and the rest) to the modules that define each name. Metro does not tree-shake, so a single `import { Dialog } from '@hozo/core'` used to put every pattern in the bundle. In the native demo, Hozo's share of the dev bundle fell from 591 KB to 436 KB. Names it cannot follow, and namespace imports, stay on the barrel.
