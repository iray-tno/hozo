---
'@hozo/compiler': patch
---

Compile Tailwind class merges only when the resolved merger matches the generated conflict table. Preserve calls to other versions, modified bundles and mergers without resolution evidence. Source-only Native text-forwarding analysis leaves unresolved mergers to the component.
