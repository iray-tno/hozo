---
"@hozo/migration-audit": patch
"@hozo/compiler": patch
---

`hozo-migration-audit --fix` prints, as a diff, the `react-native` imports the Web build moves to `@hozo/rn-compat`, written into source; `--write` applies them. `@hozo/compiler/analysis` exports the pass it uses, `reactNativeImportFix`.
