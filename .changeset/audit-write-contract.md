---
"@hozo/migration-audit": patch
---

`--fix --write` now also refuses a file Git does not track, including an ignored one selected by `--include`. Before this it checked only `git status`, which does not list ignored files, so such a file could be overwritten with no copy left anywhere. The README states what the audit may write as a contract and no longer calls the tool read-only.
