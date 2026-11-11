---
"@hozo/migration-audit": minor
"@hozo/cli": minor
---

`hozo dry-fit --file-signal <name>=<regex>` counts the authored files whose source matches the pattern and reports the count as `corpusSignals.<name>`. It is the command-line form of the `fileSignals` option, so a corpus runner can use the same command as a user. The option can be repeated. A malformed name or pattern exits `2` with `[invalid-file-signal]`.
