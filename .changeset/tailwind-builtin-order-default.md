---
"@hozo/compiler": minor
---

Tailwind's class order is now the default for every compile, not only where a project's CSS is captured. The standalone `compile`/`compileNative` API, the WASM binding, Web previews and a build whose CSS could not be captured now rank classes with Tailwind facts built into Hozo: `p-4 p-2` is 16px there too, where it used to keep authored order and take 8px. A captured project still uses its own Tailwind.
