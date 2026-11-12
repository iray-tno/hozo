---
"@hozo/cli": minor
"@hozo/migration-audit": minor
---

`hozo square` now checks the code as well as the setup. After the setup checks, it runs the audit `hozo dry-fit` runs, against the stylesheet the css check found, and reports each error and warning where it is. The JSON report embeds the audit's report whole as `code.report`.

- `--compare <report>` compares the code with a previous `hozo square --format json` or `hozo dry-fit` JSON report.
- `--fail-on new-errors` fails only on code errors the baseline did not have. Setup errors still fail it.
- A fatal setup finding, such as a bundler config without its Hozo adapter, skips the code half and says which check stopped it.
- When the compiler cannot load, the setup report still prints, and the command exits 2.

`@hozo/migration-audit` now exports `validateBaseline`.
