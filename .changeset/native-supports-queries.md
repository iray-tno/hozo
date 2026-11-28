---
"@hozo/compiler": patch
---

Evaluate Tailwind `supports-[...]:` and `not-supports-[...]:` feature queries at compile time against React Native's Yoga/StyleSheet capability, applying supported queries (`supports-[display:flex]:`, `supports-[gap:1px]:`, `not-supports-[display:grid]:`, boolean `not`/`and`/`or` expressions) with zero runtime cost and omitting unsupported progressive-enhancement branches with a non-blocking warning.
