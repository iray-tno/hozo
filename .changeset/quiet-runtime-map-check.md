---
"@hozo/compiler": patch
"@hozo/metro": patch
"@hozo/vite": patch
---

The build-time `CLASS_NOT_IN_RUNTIME_MAP` check no longer reports a word that is not written inside a string, such as a variable named `ring`. It also no longer reads Hozo's own generated candidate module or a dependency's built output, which in a workspace is a symlink into the package's `dist`.
