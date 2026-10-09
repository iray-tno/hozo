# @hozo/compiler

The JS entry point to Hozo's Rust compiler. Every bundler integration goes
through it; nothing else loads the native binding.

## How the binding gets here

Development builds a debug addon next to `src/`:

```sh
pnpm --filter @hozo/compiler build:native
```

A release builds one npm package per platform, each carrying a release
binary and declaring the `os`/`cpu`/`libc` it serves:

```sh
pnpm --filter @hozo/compiler pack:native                       # this machine
pnpm --filter @hozo/compiler pack:native -- --target <triple>  # a cross build
```

`@hozo/compiler` lists all eight as **optional** dependencies, which is
what makes an install ship one binary instead of eight: npm evaluates each
one against the machine, installs the match, and skips the rest without
complaint.

The loader tries them in order — an adjacent development addon first, then
the platform package — and `HOZO_NATIVE_BINDING` overrides both.

## Read-only module analysis

`@hozo/compiler/analysis` exposes `analyzeModule(source, { compiler, file, root, targets })`.
It owns diagnostic aggregation over the actual Web module lowering path and a Native
component/Canvas compiler probe. Only requested targets are assessed; imports/JSX inventory
currently comes from the Native module parser API. Results include target modes, complete
findings, partial failures and stage timings. No files or compiler caches are written.

Consumers such as migration-audit should use this result instead of reconstructing the
pipeline with separate compile calls. The contract does not certify full Metro preparation,
production dependency graphs, runtime behavior or every member of an import rewritten to Hozo.
Parser-reported syntax errors survive even if no JSX root was recovered; comprehensive semantic
validation still belongs to the application's tooling. Diagnostics already use UTF-16 offsets.
Positions from rewritten inputs without an authored source map are explicitly unmapped.

`ProjectFact<T>` distinguishes resolved (explicit/discovered), defaulted, absent, unresolved,
unsupported and invalid inputs for project-aware consumers. Analysis defaults to caller-
prepared compiler state; it does not execute application configuration or promise shared-worker
thread safety. See [#790](https://github.com/iray-tno/hozo/issues/790).

`await prepareAnalysisProject(options, themeLoader)` prepares theme/reset/trusted-source facts once.
Pass the shared `loadStaticProjectTheme` from `@hozo/tailwind` as the loader, and a snapshot of selected
authored `{ file, source }` entries. The injected service avoids a compiler/Tailwind dependency cycle;
audit does not reconstruct compiler decisions. The resulting compiler uses the same candidate-cache
and preflight policy as builds, in memory only. The default `auto` scan is conservative (utility-shaped
comments/unused strings can count) and limited to supplied sources, not a claim about the app's actual
reset. Explicit primitive sources extend the defaults. Invalid/unsupported themes produce labelled
partial context with builtin compiler assumptions; no partial theme is silently accepted. Font
registration, import aliases and cross-file StyleX still require later preparation.

## The list that must not drift

`src/native-targets.ts` is the one table. Two independent things read it:
the packer, going from a Rust target triple, and `native-loader.ts`, going
from `process.platform`/`process.arch` at runtime. A disagreement between
them is invisible until someone on the platform nobody develops on installs
a published package and is told no addon could be loaded for it, so
`native-targets.test.ts` walks the table through both directions.

`scripts/check-artifacts.mjs` refuses a release that is missing any of the
eight, for the same reason: an optional dependency that does not exist
installs exactly as quietly as one that was skipped on purpose.

## Release

`.github/workflows/release.yml`, on a `v*` tag. **It has never run.** It
was written on a machine that can build one of the eight targets and cannot
execute a workflow, so the musl and cross-architecture jobs in particular
should be expected to need correcting on the first real attempt.

### Read-only analysis scope and StyleX context

`@hozo/compiler/analysis` exposes `discoverAnalysisSources` and `prepareAnalysisStylex`,
used by `prepareAnalysisProject`. They reuse the integration source walk and StyleX registry,
but never open/persist a checkout cache. Authored inputs and graph-only sources are separate;
only requested imports/reexports read context files. Static JSONC alias inputs and context
sources are hashed. Package/custom bundler resolution remains unknown, not guessed.

An in-memory `StylexModuleCache(undefined, { resolverOnly: true })` accepts only recorded
resolver edges, preventing platform-scoped graphs from falling back to an unrelated relative
spelling. Web/iOS/Android graphs and their registry snapshots are prepared once. Pass
`stylexContexts` and `stylexRegistries` to `analyzeModule`; the latter avoids regenerating
registry inputs per file. The mutable compiler still belongs to one serial worker.
Target results distinguish current integration eligibility from parser/compiler capability;
the analysis API does not expand the Web/Metro transform extension gates or certify a build.

Module inventory and StyleX definitions select syntax using their filenames: `.ts`/`.mts`
are non-JSX TypeScript, `.tsx` is TSX, and JavaScript sources accept JSX but not TypeScript.
`compileNativeModule(source, bindings, sourceFile)` and `summarizeStylexModule(source, sourceFile)`
retain their TSX default when no filename is supplied. StyleX registry entries carry `sourceFile`
separately from their opaque module ID; the project cache supplies it and invalidates old snapshots.
This is syntax parsing, not a TypeScript type-check or support for Flow syntax.

### Authored React Native usage

`analyzeReactNativeUsage(source, sourceFile?)` is an opt-in Rust symbol-analysis API;
ordinary builds do not run it. `analyzeModule` includes it as the `source:rn-usage` stage.
Direct ESM imports (including types/default/namespace forms), reexports and side-effect
edges retain authored UTF-16 spans. References resolve to the imported symbol, excluding
shadowed locals, strings and comments. Type references, JSX tags, component values,
static member paths and dynamic member access remain distinct. Closing JSX tags are
reference occurrences too; counts are not component or call counts. No data-flow through
subsequent aliases is inferred.

Parser or binding errors yield failed analysis, never a successful empty census. This
inventory does not assess CommonJS, dynamic imports, TS import-equals, indirect wrappers,
actual rewrite dispositions or member compatibility. Audit must consume compiler-owned
rewrite decisions separately; an observed import/member is not dependency-removal proof.

### Actual Web import decisions

The shared Web lowerer uses `reactNativeImports(source, sourceFile?)` AST declarations
instead of matching import-like text. Its `imports` observer events journal the same
specifier edits that produce the output. Mixed default/named imports, Unicode aliases,
comments and escaped module strings are handled structurally; type/namespace/default
imports and declarations with import attributes are not moved. Policy `allow` does not
run this rewrite. Ordinary compilation does not build semantic usage scopes.

`analyzeModule` joins these events to authored `reactNativeUsage.bindings` indices in
`targets.web.reactNativeImports`. A later pass can join only an unchanged, unique
specifier-token/binding identity; uncertain provenance stays partial/not-assessed.
Failed targets keep their evidence but are not successful migration verdicts. Retained
imports do not mean their JSX uses survived: lowering may leave an unused import for
the bundler to elide. This journal deliberately does not assess semantic reference
dispositions, forwarding edges, member compatibility, Native module imports, package
resolution or production dependency removal. These remain separate evidence layers.

### Actual Web JSX tag evidence

`compile(..., ..., { tagEvidence: true })` opts into the Web renderer's emission evidence:
exact opening/closing name decisions and copied source fragments. Ordinary compilation
allocates neither journal. `analyzeModule` uses this same
path and exposes `targets.web.reactNativeReferences`, joined by `bindingIndex` and
`referenceIndex` to the authored symbol inventory. Actual import/Canvas splices preserve
coordinates only for unchanged source runs; generated or ambiguous spans stay unjoined.

`replaced-jsx-tag`, `preserved-jsx-tag` and `removed-jsx-tag` describe emitted names (including
closing tags consumed by void elements). A preserved name may resolve through a moved import;
its spelling does not certify an RN dependency. Neither containing-root spans nor a census of
emitted code are used to classify references. Non-JSX APIs, factories, handler/prop expressions,
types and unjoined tags stay `not-assessed`, not assumed retained or unsupported. Failed/partial
targets retain evidence without successful headline claims. Native/member/runtime compatibility
and production dependency removal remain separate work.

### Actual Web non-JSX value evidence

`targets.web.reactNativeValues` follows authored non-JSX runtime references through every
actual module splice (import movement, Canvas edits, semantic roots, authoring-import cleanup,
and generated helper imports). Unchanged module runs and explicitly recorded backend copies
that reach final output carry authored identity. Their final UTF-16 `emittedSpan` is joined to the actual import
journal: `rewritten-to-hozo`, `remains-react-native`, or `not-assessed`. Ordinary lowering
does not allocate this provenance journal or collect semantic edit arrays.

`CompiledComponent.sourceCopies` uses authored-input and root-relative emitted UTF-16 spans,
converted independently from Rust byte offsets. It records actual verbatim prop/child fragments
(excluding nested replaced nodes), and values emitted into DOM style/spread normalizer calls.
These calls introduce no lexical binder around the copied value. Void children are discarded
from the trace. The module path validates the ranges and composes class namespacing only over
unchanged fragments; matching strings alone cannot create identity. `sourceEvidence` distinguishes
`unchanged-module-run` from `backend-copied-run` in final outcomes.

Canonical onPress and responder handler values also receive copy records when actually emitted.
Renaming an event prop or passing a function value to `hozoInteractive(...)` does not wrap the
authored function body in a new scope. A disabled link's generated `(event) => ...` exists only
in the sibling conditional arm, not around its authored handler. Only the copied handler value
is traced, not synthesized callback syntax or an unrecorded disabled guard. A handler omitted
because its mapped prop collides with an authored target gains no copy evidence.

Other generated expressions remain unknown, even when their spelling appears in output.
Condition reconstruction and other canonical expressions without copy records are not mapped.
Duplicated output copies do not yield a unique final reference.
There is no inferred map for arbitrary generated JSX. Type references are excluded. An unrecorded edit makes
output provenance `unmapped`/`partial`, not a positive claim; later failures preserve evidence
but set the verdict to `failed`. Import-policy `allow` has no assessed origin verdict.
Moving a dynamic member read, namespace value or factory does not certify the adapter's member
contract, Native rewriting, production dependency removal or runtime behavior. The scope is
`non-jsx-source-runs` with `generatedExpressions: copied-runs-only`, not full expression coverage.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
