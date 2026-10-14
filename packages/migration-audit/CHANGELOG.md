# @hozo/migration-audit

## 0.3.0

### Minor Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add the compiler-owned `@hozo/compiler/analysis` entry and project-aware migration analysis. The audit records canonical lowering diagnostics, authored locations or explicit unmapped locations, source/binding provenance, React Native import/tag/reference/value rewrite journals, project facts and stage timings rather than reconstructing compiler decisions from output alone.
  
  The CLI discovers nonempty `src/` and `app/` layouts, falls back to the checkout root, accepts repeated source/include/exclude selections and inventories JS/TS separately from imported context modules. Interactive stdout is Markdown; piped stdout remains JSON, with explicit format/output overrides. Bluesky-specific ALF checks remain in the corpus measurement path, not the generic report.
  
  Static theme, preflight assumptions, platform-scoped StyleX imports, installed/local tsconfig presets and supplied font-registration facts can inform analysis. Executable CSS configuration and remote stylesheets are reported as not assessed, never executed; missing and invalid context is not treated as successful absence. Baseline comparison distinguishes compatible comparisons from unassessed context and can fail CI on current errors or new error findings.
  
  **Report consumers must migrate to JSON schema 3.** Older baselines cannot supply a schema-3 semantic comparison. A clean compiler audit still does not prove production dependency removal, runtime behavior, Native Metro preparation or device font availability. See the migration-audit README for the supported facts and comparison boundaries.

### Patch Changes

- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`cc85dce`](https://github.com/iray-tno/hozo/commit/cc85dce47dcd3df869e8659dceffee7f6b01123b), [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`6e2cff6`](https://github.com/iray-tno/hozo/commit/6e2cff6013e69b3ae276473c39a7fbe7f1e7e1b4), [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10), [`8a7c8c7`](https://github.com/iray-tno/hozo/commit/8a7c8c73dc20d025a10ae5fe472bb81dc8659ce7), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`f730194`](https://github.com/iray-tno/hozo/commit/f7301946a75b7fc1e67bc4c135df43497b2b7f72), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92), [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6)]:
  - @hozo/compiler@0.3.0
  - @hozo/tailwind@0.3.0

## 0.2.0

- Distinguish component recognition from successfully lowered files, and report styling-surface observations without claiming a migration conclusion.
- Release with the stricter 0.2.0 compiler. Audit output is evidence for migration planning, not proof that an entire application is RNW-free.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/compiler@0.2.0
