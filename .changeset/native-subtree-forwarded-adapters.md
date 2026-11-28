---
"@hozo/compiler": minor
---

Merge ancestor `*:` and `**:` forwarded declarations before running Native prop, backdrop, transition, and refusal adapters so `*:backdrop:*`, `*:placeholder:text-*`, `*:selection:bg-*`, `*:caret-*`, `*:starting:*`, `*:truncate`, and `*:peer-*:` lower cleanly on matching children while preserving leaf and missing-peer refusals.
