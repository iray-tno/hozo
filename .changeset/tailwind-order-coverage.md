---
"@hozo/compiler": patch
---

`compile(..., { tailwindPlan: true })` evidence now reports, per block, the `barrier` that keeps its class list in authored order, or none when every write can be ranked.
