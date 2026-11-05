---
'@hozo/vite': patch
'@hozo/compiler': patch
---

`@hozo/vite` now adds the generated modules compiled output imports, such as `@hozo/core/generated/text-input-dom-props`, to Vite's `optimizeDeps.include`. Vite's dependency scan reads untransformed source and never saw them, so a cold dev server re-optimized and reloaded mid-run, which failed Vitest browser tests on every CI run. The `optimizeDeps.include` workaround is no longer needed. `@hozo/compiler/lower` exports `GENERATED_SPECIFIERS`, the list it is read from.
