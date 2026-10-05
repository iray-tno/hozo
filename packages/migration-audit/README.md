# @hozo/migration-audit

Read-only migration analysis for real React Native applications. It runs Hozo's Web and Native
lowerers over a checkout without installing or modifying that application, respects platform file
suffixes, and reports parse failures, diagnostics, React Native JSX left in Web output, and
structural wrong-output invariants.

```sh
npx @hozo/migration-audit .
npx @hozo/migration-audit --root ../my-react-native-app --output hozo-audit.md
npx @hozo/migration-audit . --source app --source components --format json
```

Without `--source`, the tool scans nonempty `src/` and `app/` directories (both when present),
then falls back to the checkout root when neither contains TSX. Repeat `--source` to select
explicit directories. Overlapping selections are deduplicated. Dependencies and generated
directories (`node_modules`, VCS metadata, `.next`, `.nuxt`, `.expo`, `.turbo`, `.cache`, `dist`,
`build`, `coverage`, `.test-build`, `artifacts`, `temp`) and symlinked directories are excluded.
Only `.tsx` files are currently measured; JSX-only or empty inputs fail with a short message
instead of reporting a misleading zero-file success.

Interactive terminals receive Markdown; piped stdout stays JSON. `--output *.md` selects
Markdown, other output paths select JSON, and explicit `--format json|markdown` always wins.
Use `--help` for all options and `--expected-commit` to make a corpus measurement reproducible.
The report deliberately treats its wrong-output count as a lower bound:
absence of a diagnostic is not proof that rendered behavior is correct.

The package does not clone repositories. A caller that owns a corpus should acquire and pin it,
then pass the checkout to this CLI. Hozo's own `pnpm measure:bluesky` command is one such runner.

JSON schema version 2 records `corpus.sourceDirectories` and omits application-specific metrics
from `authoredSignals`. Library callers can supply `fileSignals: { metricName: (source, file) => boolean }`
to `measureRealApp`; these counts appear separately in `corpusSignals` and the Markdown report.
The pinned Bluesky runner retains its historical `filesUsingAlfAtoms` lexical heuristic through
this extension. Bluesky's checkout pin, verification command and historical reports are preserved;
that heuristic is not presented as a generic detector of an application's design system.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
