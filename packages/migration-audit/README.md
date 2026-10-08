# @hozo/migration-audit

Read-only migration analysis for real React Native applications. It runs Hozo's Web and Native
lowerers over a checkout without installing or modifying that application, respects platform file
suffixes, and reports parse failures, diagnostics, React Native JSX left in Web output, and
structural wrong-output invariants.

```sh
npx @hozo/migration-audit .
npx @hozo/migration-audit --root ../my-react-native-app --output hozo-audit.md
npx @hozo/migration-audit . --source app --source components --format json
npx @hozo/migration-audit . --details --output hozo-audit.md
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
It saves both a readable Markdown report and complete JSON evidence under `artifacts/measurements/`.

JSON schema version 3 retains every finding (message, backend, pipeline stage and location),
per-file outcomes, stage timings, tool versions, the actual loaded binding and its SHA-256,
checkout dirty status and an authored-source fingerprint. Summary samples remain capped at 12;
JSON findings are not capped. `--details` expands all findings in Markdown. Positions use UTF-16
code units, already converted by NAPI. Positions belonging to rewritten input without an
authored source map are explicitly `unmapped`, not plausible-looking line numbers. Finding
fingerprints are content hints, not unique identities or baseline matching guarantees.

Web assessment uses the shared module lowering pipeline, including Canvas and import diagnostics.
Native assessment is a compiler-only component/Canvas probe, **not** full Metro module preparation.
Parser-reported syntax errors and tool failures remain visible, with partial diagnostic evidence;
the audit does not replace TypeScript or a complete syntax/semantic validation pass. A failed
analysis cannot close the direct RN JSX boundary just because observed residue is zero.
Project CSS, font registration, import aliases and cross-file StyleX are currently unresolved
facts; compilation uses the builtin theme and no preflight. Production builds and runtime
behavior are not assessed. Only authored TSX enters report counts, not dependency context sources.
Project-aware preparation and RN member/rewrite metadata are follow-ups in
[#790](https://github.com/iray-tno/hozo/issues/790).

The schema records `corpus.sourceDirectories` and omits application-specific metrics
from `authoredSignals`. Library callers can supply `fileSignals: { metricName: (source, file) => boolean }`
to `measureRealApp`; these counts appear separately in `corpusSignals` and the Markdown report.
The pinned Bluesky runner retains its historical `filesUsingAlfAtoms` lexical heuristic through
this extension. Bluesky's checkout pin, verification command and historical reports are preserved;
that heuristic is not presented as a generic detector of an application's design system.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
