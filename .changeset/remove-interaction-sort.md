---
"@hozo/compiler": patch
---

The compile-time interaction sort is gone: Tailwind's order comes from the shared plan for every input it can rank. An input it cannot rank (one with an arbitrary value, or a class the project's CSS does not generate) now keeps its written order between interaction variants of equal weight, while a more specific state still wins on Native. Compiles with no project CSS (preview, WASM, the standalone API) now also rank `transition-*` and the shadow sizes.
