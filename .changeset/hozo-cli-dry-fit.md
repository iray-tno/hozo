---
"@hozo/cli": minor
"@hozo/migration-audit": minor
---

Add `@hozo/cli`, the `hozo` command. `hozo dry-fit` (alias `migration-audit`) runs the migration audit with the same options and the same stdout and JSON. `hozo-migration-audit` keeps working for one minor release and prints a deprecation line on stderr.

Exit codes are now `0` passed, `1` findings at or above `--fail-on`, `2` the command could not run. An input error (an unknown option, a missing checkout, an unreadable baseline) used to exit `1`, the same as a finding; it now exits `2` and ends its stderr line with a string code such as `[unknown-option]`.
