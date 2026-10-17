# @hozo/tailwind

## 0.3.1

## 0.3.0

### Minor Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add the compiler-owned `@hozo/compiler/analysis` entry and project-aware migration analysis. The audit records canonical lowering diagnostics, authored locations or explicit unmapped locations, source/binding provenance, React Native import/tag/reference/value rewrite journals, project facts and stage timings rather than reconstructing compiler decisions from output alone.
  
  The CLI discovers nonempty `src/` and `app/` layouts, falls back to the checkout root, accepts repeated source/include/exclude selections and inventories JS/TS separately from imported context modules. Interactive stdout is Markdown; piped stdout remains JSON, with explicit format/output overrides. Bluesky-specific ALF checks remain in the corpus measurement path, not the generic report.
  
  Static theme, preflight assumptions, platform-scoped StyleX imports, installed/local tsconfig presets and supplied font-registration facts can inform analysis. Executable CSS configuration and remote stylesheets are reported as not assessed, never executed; missing and invalid context is not treated as successful absence. Baseline comparison distinguishes compatible comparisons from unassessed context and can fail CI on current errors or new error findings.
  
  **Report consumers must migrate to JSON schema 3.** Older baselines cannot supply a schema-3 semantic comparison. A clean compiler audit still does not prove production dependency removal, runtime behavior, Native Metro preparation or device font availability. See the migration-audit README for the supported facts and comparison boundaries.

### Patch Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Compile project-defined Tailwind animations and their keyframes for both backends, including keyframes needed by dynamic class candidates. StyleX conditions inside property values now reach the shared condition model.
  
  Extend Native negated conditions across supported environment, breakpoint, pixel-width, container, prop, sibling and interaction predicates. Link states use the existing interaction owner, descendant focus-visible follows that owner, and independent transform resets and runtime-state transform families compose without losing their other transform entries. Unsupported predicates are still diagnosed, not assumed false.
  
  Respect project radius tokens and built-in radius overrides, discover runtime candidates in quoted class arrays, and preserve separate Native style keys for ternary branches. Caller classes override a component's resting look while explicit state classes retain their precedence. On Web, fallback candidate rules stay below authored Tailwind utilities, and conditional class selection reaches elements that remain components.
  
  Native line-breaking utilities that cannot be represented now warn instead of failing the build. This does not implement Android/CJK line-break controls that React Native does not expose.

## 0.2.0

- Resolve chained theme aliases and paired `--dark` colour tokens for static Web/Native output.
- Carry project `@keyframes` / animation theme definitions into Native lowering. Runtime-resolved Native classes still do not gain static dark conditions.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.
