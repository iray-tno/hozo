---
'@hozo/compiler': minor
'@hozo/migration-audit': patch
---

Expose AST-derived JSX binding usage from the compiler and use it for real-app
residue measurement, excluding comments and TypeScript type arguments without
losing namespace JSX such as `Animated.View`.
