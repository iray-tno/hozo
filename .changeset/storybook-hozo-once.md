---
"@hozo/storybook": patch
---

`@hozo/storybook` no longer adds a second `hozo()` when Storybook's Vite config already has one. Storybook's Vite builder loads the project's `vite.config`, so a Vite project that followed both getting-started guides ran Hozo twice in Storybook, which can drop CSS (a Vite build of `examples/login-demo` with two lost the scroll-view and pointer-events base rules). The project's own `hozo()` and its options now stand.
