---
"@hozo/compiler": minor
"@hozo/migration-audit": minor
"@hozo/tailwind": minor
---

Add the compiler-owned `@hozo/compiler/analysis` entry and project-aware migration analysis. The audit records canonical lowering diagnostics, authored locations or explicit unmapped locations, source/binding provenance, React Native import/tag/reference/value rewrite journals, project facts and stage timings rather than reconstructing compiler decisions from output alone.

The CLI discovers nonempty `src/` and `app/` layouts, falls back to the checkout root, accepts repeated source/include/exclude selections and inventories JS/TS separately from imported context modules. Interactive stdout is Markdown; piped stdout remains JSON, with explicit format/output overrides. Bluesky-specific ALF checks remain in the corpus measurement path, not the generic report.

Static theme, preflight assumptions, platform-scoped StyleX imports, installed/local tsconfig presets and supplied font-registration facts can inform analysis. Executable CSS configuration and remote stylesheets are reported as not assessed, never executed; missing and invalid context is not treated as successful absence. Baseline comparison distinguishes compatible comparisons from unassessed context and can fail CI on current errors or new error findings.

**Report consumers must migrate to JSON schema 3.** Older baselines cannot supply a schema-3 semantic comparison. A clean compiler audit still does not prove production dependency removal, runtime behavior, Native Metro preparation or device font availability. See the migration-audit README for the supported facts and comparison boundaries.
