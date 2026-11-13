---
'@hozo/compiler': patch
---

When no native compiler package fits the machine, `@hozo/compiler` now tries `@hozo/compiler-wasm32-wasi`, a WebAssembly build of the same compiler, before giving up, and the error names it. That package is not published yet, so for now this only changes the error message on an unsupported platform. It is the groundwork for opening Hozo projects in StackBlitz, whose WebContainers cannot load a native addon.
