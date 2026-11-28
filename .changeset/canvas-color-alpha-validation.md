---
"@hozo/compiler": patch
---

Resolve palette alpha modifiers (`fill-blue-500/50`, `stroke-black/25`, and custom `@theme` colours with alpha) in Canvas paint lowering on Web and Native, and diagnose unknown or CSS-inherited colour tokens (`fill-current`, `stroke-inherit`) instead of emitting unresolved `var(--hozo-color-...)` or `hozo-unresolved:...` values.