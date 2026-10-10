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
npx @hozo/migration-audit . --css app/globals.css --preflight auto
npx @hozo/migration-audit . --primitive-source @acme/ui
npx @hozo/migration-audit . --source packages/app --include 'packages/**/*.{tsx,jsx,ts}' --exclude '**/*.test.*'
npx @hozo/migration-audit . --native-platform ios
npx @hozo/migration-audit . --compare previous-audit.json --output changes.md
npx @hozo/migration-audit . --fail-on error --output hozo-audit.json
npx @hozo/migration-audit . --compare previous-audit.json --fail-on new-errors --output changes.md
```

Without `--source`, the tool scans nonempty `src/` and `app/` directories (both when present),
then falls back to the checkout root when neither contains JS/TS source. Repeat `--source` to select
explicit directories. Overlapping selections are deduplicated. Dependencies and generated
directories (`node_modules`, VCS metadata, `.next`, `.nuxt`, `.expo`, `.turbo`, `.cache`, `dist`,
`build`, `coverage`, `.test-build`, `artifacts`, `temp`) and symlinked directories are excluded.
`.tsx`, `.jsx`, `.ts`, `.js`, `.mts` and `.mjs` enter the authored inventory; declaration files
(`.d.ts` / `.d.mts`) do not. Repeat `--include` / `--exclude` for checkout-relative globs.
Includes follow the shared compiler walk's policy: explicit includes override gitignore,
but built-in generated/dependency exclusions still apply. `--source` must remain inside the
checkout and cannot select a directory symlink. Empty selections fail with a short message.
Explicit includes for a monorepo should be paired with `--source .` or the appropriate roots.
Known declaration/custom-excluded source files are listed separately; built-in excluded directory
contents and unsupported extensions are not enumerated, rather than reported as zero.

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
The compiler selects syntax from each filename: `.ts`/`.mts` are non-JSX TypeScript,
`.tsx` is TSX, and `.js`/`.jsx`/`.mjs` accept JavaScript with JSX, not TypeScript or Flow.
This applies to both authored inventory and imported StyleX definitions. Valid `.ts` generic
arrows are no longer rejected by a TSX-only probe. Parser errors remain `SOURCE_SYNTAX_ERROR`;
invalid TSX is not retried as TS to hide errors. This is not TypeScript type-checking.
Each target records `integrationEligibility`: Web `.tsx` is `semantic-module`, other source
extensions are `runtime-imports-only`; Native non-TSX results are `compiler-probe-only`.
No extensions are renamed to claim integration support. Probe-only counts are not backend
shape mismatches. `scope.tsxFiles` retains its literal TSX meaning; `authoredFiles` is the
new denominator, with extension counts and a separate context-module count.
Parser-reported syntax errors and tool failures remain visible, with partial diagnostic evidence;
the audit does not replace TypeScript or a complete syntax/semantic validation pass. A failed
analysis cannot close the direct RN JSX boundary just because observed residue is zero.
Static CSS/theme is discovered using the same conventional names as Hozo's integrations, or
selected explicitly with `--css`. Imported CSS is resolved through the shared Tailwind loader.
Colors, spacing, paired dark tokens and project keyframes reach both compiler backends.
Theme resolution means Hozo's existing token extraction completed, not that every CSS/Tailwind
construct is supported or every theme expression converts to Native.
Entry and imported CSS are parsed structurally: executable `@plugin` / `@config` and remote stylesheet
imports are explicitly not assessed, never executed. No bundler/config JavaScript or app scripts
are loaded. Safe theme preparation is fresh on each invocation, so edited imports cannot reuse
a stale successful result. CSS paths and content hashes are recorded separately from authored files.

No CSS is an `absent` entry with a visibly defaulted builtin theme. Broken CSS is `invalid`;
executable configuration is `unsupported`. Both yield partial context, with builtin tokens only
as a labelled probe; they cannot close the RN JSX boundary as an authoritative project verdict.
An explicitly missing/unreadable CSS entry is an input error. `--preflight auto|true|false` is a
reset assumption supplied to both backends, not proof of the application's bundler configuration.
Auto (the default) uses the compiler's Tailwind candidate facts over **selected authored JS/TS**;
the shared conservative token scan can count utility-shaped comments or unused strings.
Graph-only sources do not contribute to the selected-scope reset assumption. `--primitive-source` is
repeatable and extends the trusted defaults; discovery never trusts arbitrary component names.

Cross-file StyleX definitions/reexport chains use the compiler's shared module registry in
memory, with **separate Web/iOS/Android resolver-owned edges**, never another utility engine.
Only graph-requested context files are read outside the authored selection; their hashes and
purpose are retained without inflating `files`, source bytes or authored signal counts.
Static resolution handles relative imports, directory indexes, ESM `.js` spellings for TS,
and exact/single-wildcard `paths` in root JSONC `tsconfig.json` with local relative extends.
The alias fact is scoped to these settings, not all TypeScript/bundler configuration.
Package extends, package exports/custom resolver hooks and bundler aliases remain explicitly
unassessed. No configuration JS, tsconfig plugins, application imports or scripts are executed.
Nonselected but admitted sources can supply graph facts (including excluded authored files);
this does not turn them into migration targets. Unresolved edges are retained per platform.
Default platform preference is `.web` then unsuffixed for Web, and `.ios` / `.android` then
`.native` then unsuffixed for Native. Explicit filenames remain explicit. This static model is
not a certification of a particular bundler's resolution; custom module suffix policies are not
applied. Shared/native component probes use Android by default; `--native-platform ios` selects
iOS instead. Explicit `.ios` / `.android` filenames always use their own graph. Both native
graphs are prepared, but a shared file is counted only once, for the selected probe platform.

Font registration, production builds, runtime behavior and entry-point graph reachability are
not assessed. `contextStatus: prepared` describes successful theme/reset/static graph preparation,
not that all project facts or unresolved graph edges have answers. Unrecorded generated RN
expressions and complete member compatibility remain follow-ups in
[#790](https://github.com/iray-tno/hozo/issues/790).

The schema records `corpus.sourceDirectories` and omits application-specific metrics
from `authoredSignals`. Library callers can supply `fileSignals: { metricName: (source, file) => boolean }`
to `measureRealApp`; these counts appear separately in `corpusSignals` and the Markdown report.
`measureRealApp` and `runCli` are now asynchronous; library callers must `await` them. Options
include `css`, `preflight` and `primitiveSources` (an array of explicitly trusted additions).
Library options also include `include`, `exclude` (arrays of globs) and `nativePlatform`.
The pinned Bluesky runner retains its historical `filesUsingAlfAtoms` lexical heuristic through
this extension. Bluesky's checkout pin, verification command and historical reports are preserved;
that heuristic is not presented as a generic detector of an application's design system.

### Binding-aware React Native source inventory

`reactNativeUsage` counts compiler-resolved ESM references, not import spellings or a
compatibility score. Each JSON file record retains the complete authored bindings and
references with UTF-16 spans. Aliases and lexical shadowing are resolved; explicit type
imports, value imports used only as types, unused values, component values, static/dynamic
member paths, local exports, direct reexports and side-effect imports stay distinct.
Reference counts include opening and closing JSX tag occurrences, not component/call counts.
Parse/binding failures and unassessed files stay visible.

CommonJS `require`, dynamic imports, TS import-equals, indirect wrapper modules and data-flow
through subsequent aliases are outside this ESM inventory. Moving an import, resolving its
package, removing production RNW dependencies and runtime/member compatibility are separate
claims, not a renamed migration-ready score.

### Actual Web import rewrite journal

`reactNativeImportDecisions` summarizes the shared compiler lowerer's actual import-specifier
decisions. Complete per-file outcomes are in `targets.web.reactNativeImports`, joined by
`bindingIndex` to authored source usage. The audit owns no import replacement table and
does not infer these decisions by re-reading emitted code. Only completed targets enter
the successful headline counts; partial/failed journals remain in JSON with their status.

`retained-react-native` describes an import declaration, **not** a remaining runtime
reference: JSX lowering may already have removed its uses while leaving the import for
the bundler. `type-only` does not certify erasure. Namespace/default imports and imports
with attributes are deliberately retained; policy `allow` leaves rewriting not assessed.
Forwarding/side-effect edges, semantic-reference dispositions, member compatibility,
package resolution, production dependency removal and Native import rewriting remain
unassessed by this journal. Native analysis is still a compiler-only probe.

### Actual Web JSX tag journal

`reactNativeReferenceDecisions` summarizes exact tag emissions from the Web backend.
`targets.web.reactNativeReferences` retains each authored `bindingIndex`/`referenceIndex`
outcome in JSON. Import/Canvas edits remap unchanged source runs only; generated text is
not guessed back to an authored identifier. Opening/closing names count separately, not
as component instances. Void elements can consume authored closing tags.

Preserved tag spelling is not a remaining RN dependency: an import may have moved to Hozo.
Non-JSX APIs, factories, type references, prop/handler expressions and tags without an exact
backend emission remain `not-assessed`, not implicitly retained or unsupported. Only completed
journals enter successful tag counts; partial/failed evidence stays visible in JSON.
Member compatibility, Native module rewriting, production builds and runtime still require
separate evidence. The audit does not reimplement backend policy or parse emitted code to
invent reference decisions.

### Actual Web non-JSX values and review inventory

`reactNativeValueDecisions` separately summarizes non-JSX runtime references with validated
source-run evidence across actual module edits and an actual import-origin decision. Per-file
`targets.web.reactNativeValues` retains authored binding/reference indices, final emitted UTF-16
spans, reasons and explicit scope. `unchangedModuleReferences` and `backendCopiedReferences`
distinguish untouched module source from actual backend-carried prop/child fragments and DOM
style/spread normalizer values. Nested replacements, discarded void children and changed class
name fragments cannot acquire copied identity. Emitted onPress/responder handler values receive
records too: the function value stays in its authored scope, outside the interactive helper or
the sibling disabled-link callback. Dropped handlers, synthesized callback syntax and other
expressions without emission records stay unknown, not retained; generated expression scope is
`copied-runs-only`.
Type references
are excluded separately. Completed-file counts include unknowns; failed/partial/unassessed
journals stay in JSON without padding successful headline counts or inventory rows.

The generic inventory groups authored import/member/access and observed origin outcomes, not
adapter support guesses. Each row has occurrence counts, distinct-file counts and up to 12
sample files; JSON keeps all individual outcomes regardless of sampling. Retained RN-backed
values are a migration review queue, moved values still require member-contract verification,
and dynamic/namespace access needs manual review. The audit does not certify member compatibility,
package installation, third-party RNW dependence, production dependency removal or runtime.

### Reviewed member contracts and next actions

Completed Web value outcomes also carry the compiler's `memberContract`; the report does not keep
its own ownership/support table. Inventory rows retain the status, declaration-subset limitations,
next action and implementation/test paths. Markdown displays these separately from import origin.
`reviewedAdapterReferences`, `retainedGuidanceReferences` and `unreviewedMemberReferences` partition
the same completed-file non-JSX runtime references, not all RN APIs or a compatibility percentage.

The initial catalogue reviews 18 Platform/StyleSheet/Keyboard/Dimensions members and gives next
actions for 10 retained RN members. No-op Keyboard notifications, placeholder Platform.Version and
object-only StyleSheet assumptions are explicit. Only direct named-import static members with
actual final origin evidence are reviewed; aliases work, while dynamic/namespace accesses, whole
values, missing entries and untraced expressions stay unassessed. Missing review means unknown,
not unsupported. JSON keeps per-reference reviews; the 12-file sample cap does not cap counts.

These are reviewed declarations and migration guidance, not checks of call arguments, writes,
data flow, installed adapter versions, Native or runtime behavior. `memberCompatibility` remains
`not-assessed`. Source paths refer to the compiler's Hozo review, not the audited checkout.
Markdown evidence links point to current main, not a frozen installed-tool source revision.
Partial/failed journals do not contribute positive reviews. No app code/config is executed.

### Baseline comparison

Save a JSON audit, then pass it to `--compare`. The current audit stays complete and gains a
`comparison` field; Markdown includes the summary and up to 12 records per category, with
`--details` expanding all finding outcomes. Display limits never cap JSON counts. Library
callers can use `compareReports(current, baseline)` without running either application.

Comparison is informational by default. It does not fail a command for findings or claim an
improvement percentage. Malformed/unreadable baseline input fails with a short message.
Explicit `--fail-on` policies can turn findings into a CI gate, as described below.

- Unique compiler subjects match within the same relative file, backend and diagnostic code.
  Ordinary line movement is continued, not added. Message/severity changes retain both records.
- Duplicate subjects in edited files, missing authored anchors and possible cross-file
  moves/clones stay unassessed. Exact duplicate records can continue when source is unchanged.
  Removed files are inventory changes, not proven diagnostic resolutions.
- Repository identities, source selection, effective reset/theme/trusted sources, stylesheet,
  alias configuration and graph-only context input hashes must agree. Different settings or
  schemas are non-comparable, not lower-error successes. Partial context, failed probes and
  target/journal contract changes are explicit. Relocated checkouts need the same `--repository`
  identity; newly recorded stylesheet paths are checkout-relative like graph/config inputs.
  Older absolute-path CSS records are not guessed into a new location. No app configuration is
  executed to reconstruct missing inputs.
- File-level Web RN boundaries compare the compiler's actual import/tag/value journal category
  counts, joined to authored usage. Unknowns/types remain visible. These are not matched
  cross-edit runtime references, member certification or production dependency-removal evidence.
  Member-review prose/evidence edits alone are not rewrite changes; reviews stay in the audit's
  separate member guidance inventory.
- Toolchain/source provenance differences are displayed independently. Two reports cannot
  attribute a count change to a tool upgrade rather than an app edit. Binding install paths are
  not tool identity; binary hashes and recorded versions remain evidence.

`comparable` describes this static observation comparison, not that all application behavior,
fonts, indirect RN references, production dependencies or devices were assessed. JSON retains
all ambiguous/partial records and before/after boundaries regardless of Markdown sample limits.

### Explicit CI failure policies

`--fail-on none|error|new-errors` controls diagnostic exits. The default is `none`.

| Policy | Exit behavior |
|---|---|
| `none` | Findings are informational, including authored syntax errors. |
| `error` | Fail for any current error finding across Source, Web or Native. Warnings do not fail. |
| `new-errors` | Require `--compare` and a `comparable` result; fail for added errors or a matched finding escalating from non-error to error. Continued errors and error-message-only changes do not fail. |

Input errors and tool/analysis failures are nonzero in **every** mode. A compiler exception
(`ANALYSIS_FAILED`) or incomplete file analysis cannot be grandfathered by a baseline. Authored
syntax rejection (`SOURCE_SYNTAX_ERROR`) is a diagnostic, not a crashed compiler; it stays
informational in `none`, fails `error`, and prevents a complete `new-errors` comparison.

Partial/non-comparable baselines are **blocked**, not zero new errors. This includes missing
project facts, ambiguous/moved subjects, removed files, changed scope/settings and failed probes.
For such a project, use `error` for the current known errors or keep `none` for observation;
do not clear unknowns or weaken the baseline's evidence to get a green result. Even a passed
policy is not migration readiness, runtime correctness or a full compatibility assessment.

The CLI writes the complete JSON/Markdown report **before** returning a policy failure, so CI
can upload evidence on failed steps. Invalid arguments/baseline input fail before analysis or
output. Exit `0` means the selected policy passed; `1` means a failed/blocked policy or input/tool
failure. A failed/blocked policy also emits a brief stderr explanation without polluting JSON stdout.

`failurePolicy` version 1 records mode, status, exit code, reasons and uncapped finding indices.
`errorFindings` and `analysisFailures` index current `findings`; `newErrorFindings` index the
comparison's `findings.added` or `findings.changed` array. `newErrors: null` means not assessed,
not zero. Counts describe backend finding occurrences, not distinct source defects.
Library callers can use `evaluateFailurePolicy(report, mode)` after `measureRealApp`/`compareReports`.
`runCli` records the policy and returns the report without changing `process.exitCode`; only the
executable applies the exit. This keeps embedded audit calls independent of the caller's process.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
