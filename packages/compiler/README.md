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

## Candidate stylesheet cascade

The project candidate cache supplies CSS for class strings that cannot be fully
compiled statically. Its ordinary utility selectors live in
`@layer utilities.hozo-candidates`, below Tailwind's direct `utilities` rules.
Raw HTML therefore keeps Tailwind's responsive/state cascade whichever stylesheet
is imported first. The stylesheet declares the standard `theme, base, components,
utilities` layer order; applications with a custom layer policy should account for it.

Compiled dynamic class targets also receive the internal `hozo-candidate-owner`
class. A second, unlayered copy of the utility rules matches only that exact target.
The marker sits inside `:where()`, so it adds nothing, and `:not(hozo-none)` adds one
type selector's weight, (0,0,1). That settles static + dynamic on one element by
specificity rather than by which stylesheet the bundler emits first:

- a caller's class beats the component's resting look, its unconditional classes and
  a branch the source picked (`size === 'sm' ? 'px-3' : 'px-4'`, written through a
  weightless `:where(.hozo-cond-…)`, a class the branch toggles), all at (0,1,0);
- the component's state rules, `:hover`, `[data-hozo-disabled]`, `[aria-…]` and the
  rest at (0,2,0), beat the caller's class.

Native orders its style array the same way: the caller's `hozoClasses(...)` goes after
the resting entries and before the element's state entries. Simply layering every
fallback rule would instead let unlayered static CSS win.
Dynamic component class slots mark their own child target, not an entire subtree.
Empty/absent class values remain empty/absent. Do not author the internal marker.

This costs additional CSS declarations and a small generated Web class-string
operation; keyframes are not duplicated. It introduces no new runtime dependency
and does not change Native class resolution or add Native dynamic-variant support.
The browser regression in
[`candidate-cascade.test.mjs`](../../examples/storybook-demo/scripts/candidate-cascade.test.mjs)
checks real Tailwind output, both import orders, multiple viewport widths, and
compiled dynamic styles against the actual Native resolver's style-array result.

## Replaying candidate source facts

Build integrations can keep `CandidateCache.exportFile(id)` beside a cached
transform's exact input revision. The opaque record carries the native scan
version, trusted-source policy, runtime class names and `usesTailwind` fact.
It contains no theme, resolved styles, IR handle or mtime. `importFile` validates
the contract before changing a cache and does not scan the source again.
The persistent cache now validates the trusted-source policy too: changing
`sources` invalidates old mtime hits. Internal snapshot format 5 discards older
cache files once; reopening under the same policy still reuses unchanged facts.

`reconcileRuntimeCandidateContributions` from `@hozo/compiler/project` assembles
records for an adapter-supplied authoritative input set. Include configured
authored content as well as active derived modules, keeping full environment/
query IDs and validated revisions. Duplicate equal observations are harmless;
missing, stale, conflicting or incompatible observations return `incomplete`
**without a partial publisher cache**. Inputs absent from that set contribute
nothing. The function uses a new in-memory cache, never a shared disk writer.

Here `complete` means complete **runtime source facts for the declared set**.
Static/actual compiler units must still join the final ordering universe.
This API does not discover the build graph, authenticate revision tokens,
synchronize worker processes or enable new cascade winners. Adapter graph and
cached-transform lifecycle integration remains separate.

`emitFinalTailwindBatch` joins those runtime facts with a caller-declared finite
set of current retained compiler modules. It prepares one complete context and
returns module outputs and the Native candidate plan only after all succeed in
that exact context. Static units do not become runtime candidates. It owns and
disposes accepted/ignored handles, supports epoch cancellation, and returns no
partial cache on failure. Callers still own authoritative IDs/revisions, matching
compiler/theme/source policy and graph invalidation; ordinary adapter output and
winner policy are unchanged. This is not whole-worker reconciliation or final
Web candidate CSS. See [evidence and cost](../../docs/measurements/tailwind-final-batch.md).

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
registration remains unassessed. Preparation also supplies separate Web/iOS/Android static
StyleX graphs, with checkout-relative imports and supported tsconfig aliases; context modules
never inflate the caller's authored inventory.

Static root JSONC `tsconfig.json` inheritance supports local paths and installed package config
files, including a package's `tsconfig` field, default `tsconfig.json` and explicit subpaths.
Lookup stays inside the checkout (including internal package links), never the tool's dependencies
or global/parent installs. Missing configs/packages are unresolved, not absent/defaulted aliases.
Selected package manifests and config files are hashed as configuration inputs. No app/package
JavaScript, config plugins, scripts or package `main` are loaded. The recorded policy is
`checkout-static-json-extends-v1`; it is an alias-settings subset, not complete TypeScript/bundler
resolution. Multiple extends, config templates, package exports and outside-checkout links remain
unsupported. See [TypeScript's package config lookup](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-2.html#tsconfigjson-inheritance-via-nodejs-packages).

## A component package's manifest

A caller's build compiles the caller's file alone, so it cannot see what a component imported from a package does with its children. React Native does not inherit text styles, so `<Button tone="accent"><View><Text>Save</Text></View></Button>` needs to know which text classes `Button` gives its label (#950).

A package computes that from its own source and ships it, the way it ships `.d.ts` files:

```sh
hozo-manifest path/to/package           # writes hozo.manifest.json
hozo-manifest path/to/package --check   # exits 1 when it is stale
hozo-manifest path/to/package --entry src/index.ts   # when the published entry is built output
```

The package names the file in its `package.json` as `"hozo": { "manifest": "./hozo.manifest.json" }`, and lists it in `files` and `exports`.

- **What is read.** The components its entry publishes, following relative re-exports. A component is read only in a narrow shape: a pressable or `View` host given the caller's children, with classes chosen by comparing a prop with a literal -- written in place, or through `const` class lists and the `` className ? `${own} ${className}` : own `` join. Any other shape gets no entry, and the caller compiles as it did before.
- **Classes, not styles.** The manifest records classes as written, so a caller resolves them against its own theme.
- **Function or const arrow.** A named export can be a function declaration or a synchronous `const` arrow with a block or concise JSX body. Both use the same host, children and class-expression checks, including prop defaults and disabled/state forwarding. Local export aliases and relative re-exports keep their published names. Mutable bindings are not inferred; an unreadable shape gets no entry.
- **Object maps.** `tones[tone]` reads as the comparison chain it replaces, when `tones` is a `const` object literal (`as const` and `satisfies` allowed) whose keys are all written out and whose values are all class lists, and `tone` is a destructured prop. A value with no key hands down nothing from the map. A spread, a computed key or one unreadable value refuses the whole component.
- **Prop aliases.** `{ tone: t = 'neutral' }` is read using local `t` in comparisons or map lookups, but the manifest still names the public `tone` and its default. The same mapping tracks `children`, `className`, presence guards and the prop passed to the host's `disabled`. Destructured props stay out of the rest even when renamed. Nested/computed bindings, repeated public keys and unresolved or shadowed class/host/helper values are not guessed.
- **Switch returns.** A terminal `switch` on a destructured prop can use unique string cases, empty labels sharing a return, and a default anywhere in the switch. Each group must directly return a readable host (a return-only block is allowed). Instead of a default, a switch immediately followed by a readable return can use that fallback. These become the same branches as an `if` chain. Non-string/computed cases, executable fallthrough, `break`/assignment-based selection, nested switches, missing/multiple fallback forms and trailing empty groups get no entry. All branches must agree on the prop driving `disabled:`; an absent source is not an unknown source to fill from another branch.
- **React wrappers.** A `const` initializer can use React's imported [`memo`](https://react.dev/reference/react/memo) or [`forwardRef`](https://react.dev/reference/react/forwardRef) around an inline arrow or function expression, including `memo(forwardRef(...))`. Named import aliases and static members of a default/namespace React import are recognized. An optional memo comparator is not evaluated; a forwardRef callback's second identifier is a ref, not a prop. Wrappers/render functions are never executed or rewritten. Unknown wrappers, identifier targets such as `memo(OtherComponent)`, computed/optional access, binding collisions and chains deeper than eight wrappers get no entry.
- **In memory.** `buildManifest` and `summarizeTextForwarding` (from `@hozo/compiler/manifest` and `@hozo/compiler`) compute the same result without touching the file system.

The direction behind this, and why a package's facts are shipped rather than cached, is recorded on #656.

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

`summarizeStylexModule` also supplies optional `context` reference evidence. Its
`valueImports` are sorted non-intrinsic import specifiers referenced in expressions or
value exports, excluding JSX-tag-only bindings. This is deliberately wider than the
minimal StyleX dependency set: unrelated expression uses, shadowed names and type
references can remain included. The intrinsic `@stylexjs/stylex` import is recorded by
`hasStylexImport`, not treated as a project definition to resolve. Existing `imports`
and resolver requests remain intact; this evidence does not certify runtime imports,
side effects, production dependencies or Native font availability.

`parseComplete: false` preserves parser recovery without claiming an empty context
is complete. The byte-scan fast path omits `context` entirely, and persisted export-only
cache schemas are invalidated. Consumers must not treat missing evidence as complete.
This metadata alone does not relax migration-audit baseline/CI completeness checks.

Pass `prepareAnalysisStylex(...).contextFor` (or `prepareAnalysisProject(...).stylex.contextFor`)
as `stylexContextAnalysis` to `analyzeModule` for a compiler-owned, per-target
`stylexContext` verdict. The versioned `compiler-stylex-reference-context-v1` policy
distinguishes `not-required`, `complete` and `unresolved`. Absence of a runtime StyleX
import is proved from the original import bindings, not a substring scan. StyleX consumers
require the conservative reference candidates and every reached runtime reexport edge to
resolve to the prepared registry. Cycles terminate; missing/recovered reference evidence,
missing providers, changed source bytes/definitions and changed resolver-owned links remain
unresolved. Unrelated expression imports can conservatively block completeness; this is not
minimal data-flow analysis or runtime dependency certification.

Preparation snapshots source hashes/reference facts and indexes registry membership once.
Per-file verdicts read no filesystem and do not enumerate the whole registry per dependency.
The audit retains all resolver observations, including unresolved imports that do not enter a
file's static lowering requirements. It joins verdict modules/edges to those observations
before comparison, rather than independently deciding what the compiler required.

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

### Reviewed Web member subsets

Completed value journals additionally attach `memberContract` to each outcome. This compiler-owned
review is gated by the actual origin and final source-run evidence; audit only aggregates it.
`reviewed-adapter-subset` describes a declared Web subset with implementation/test paths,
`retained-guidance` gives a reviewed next action for an RN-backed member, and `not-assessed` keeps
unknown members, whole values, forwarding, namespace/default/dynamic access and untraced expressions
explicit. Missing catalogue entries do not mean unsupported. The initial review covers 18 members
of Platform, StyleSheet, Keyboard and Dimensions, plus guidance for 10 retained RN members.

`memberContracts: reviewed-web-subsets-v1` is a review format, not an installed-adapter version or
compatibility score. `memberCompatibility` and `dependencyRemoval` remain `not-assessed`: argument
shapes, writes, data flow, installed package versions, Native behavior and runtime are not verified.
For example, Keyboard listeners are no-op subscriptions and Platform.Version is a placeholder;
neither is described as an unrestricted API match. Partial/failed/policy-disabled journals do not
acquire member reviews. Evidence paths name this tool's Hozo source, not files resolved in the app.

## Internal Tailwind rule ordering

`prepareTailwindContext(snapshot).ruleOrder()` returns all generated rule IDs
in Tailwind emission order, plus the snapshot fingerprint that owns them.
The Rust index is constructed lazily once per immutable prepared context;
each explicit Node call returns a copy, not mutable access to the native cache.
This build-time boundary is for preparing the common ordering plan, not a
runtime sort or utility support verdict. It neither collapses multi-rule
candidates to their first rank nor decides CSS importance/specificity. Existing
explicit pass-through lowering preserves its previous winners. Project adapter
sessions use the bounded scalar policy described below. See
[the comparator's measured scope](../../docs/measurements/tailwind-rule-comparator.md).

`rulePriorities()` adds assessed importance/specificity/emission keys under the
same fingerprint. It returns a whole-table JS copy for project preparation,
not a per-file/device API; actual captured compile plans query the native
cache directly. Their writes expose `priorityRank` and `important` only when
original-rule ownership and selector assessment are known. Missing ranks
retain reasons, not zero. These matched-rule keys apply within a compatible
utility input tier; they do not authorize reordering independent inputs or
changing predicate/value/platform semantics. Ordinary contexts remain pass-through.
See [the integration evidence](../../docs/measurements/tailwind-write-priority.md).

`CandidateCache.renderNativeModulePlan(context, theme?)` captures a versioned
build-time sidecar during actual candidate generation. With an ordinary context,
its `code` is exactly the `renderNativeModule(theme)` output. Entry kinds identify emitted
style/state objects or refusals; predicate keys come from that same emission.
Write indices refer to pre-expansion IR properties, not flattened RN keys.
Static and candidate plans use one IR ownership/priority method. Whole-object
rank facts exist only when all writes share an assessed rule priority; they
are not proof of condition/value/platform equivalence. The context must cover
the entire candidate union. Adapters do not install this sidecar on device.
See [candidate evidence and the remaining important-syntax gap](../../docs/measurements/tailwind-candidate-priority.md).

The plan's optional `ordering` contains deterministic compact ranks only for
uniformly assessed physical-scalar objects whose actual owner predicate matches
the single assessed rule. It is absent when their emitted
keys do not conflict. Missing entries remain barriers, not rank zero. This
can feed the engine's schema-1 generated-object ABI, whose cache stores a
rank-free ordered template. Metro's generated project map now uses this policy;
the full sidecar must not become a device table. See
[the executable template and cost evidence](../../docs/measurements/tailwind-resolver-template.md).

The finite `emitFinalTailwindBatch` publisher now creates an immutable completed
output context after reconciliation. It applies the common scalar IR operation
before both static lowerers and emits the generated resolver's object ABI from
that same context. This changes bounded batch winners **together**, not just
Native fallback. `prepareFinalTailwindContext` is the internal output capability,
not an app option or mutable compiler setter. Its fingerprint is
`scalar-order-v8:<descriptor fingerprint>` so output caches cannot confuse it
with the unchanged pass-through `prepareTailwindContext` namespace. Captured
plans report the same fingerprint and `mode: 'scalar-order-v8'`. The policy
revision also changes when the eligible projection domain expands, not only
when the comparator changes; Metro transports it in its startup cache identity.

Unassessed emitted objects/predicates retain the whole input's old path; ranks
are never borrowed from a different owner or the first rule of a multi-rule
candidate. A generated map with no assessed scalar-key conflict keeps the
positional call. Full descriptors remain build-time data, and state updates
still select cached templates without reading/sorting ranks. Ordinary Vite,
Metro and Next project sessions now use the same scalar-output context; Metro's
generated dynamic map switches with them. Different complete candidate sets
may have different rank ordinals without different winners, provided their
captured CSS/theme epoch matches and ordinals never cross context boundaries.
Direct standalone compiler calls without a project session and explicit
`prepareTailwindContext` remain unchanged. See
[default-output evidence and limits](../../docs/measurements/tailwind-default-order.md).

The v2 expansion admits direct-key opacity, numeric z-index, flex
direction/grow/shrink and alignment, text alignment/transformation and
normal/italic font style. Static and candidate paths use one shared projection
assessment. Font registration, compound text metrics, gap/logical aliases and
transform composition are not included by this expansion; see
[the measured scope](../../docs/measurements/tailwind-simple-projections.md).

The v3 expansion also orders named font weights. Hoisted, structurally
validated `@property` definitions are metadata, not selector-owned writes;
unknown hoisted CSS remains a barrier. Named weights resolve against the
captured `fontWeights` theme entries, while StyleX numeric and semantic default
weights remain absolute. Values that stock Native cannot represent are
diagnosed at their actual owners and in generated candidate maps, not replaced
with 700. See [font-weight evidence](../../docs/measurements/tailwind-font-weight-order.md).

The v4 expansion admits existing absolute font-size/line-height and absolute
letter-spacing writes, including font-size's fallback line height. Native
projects containing font defaults and explicit leading preserve the latter
through the generated map's existing composition hook, with prepared objects
and no state-time rank reads/sorts or style cloning. A single canonical input
does not pass through the legacy condition-weight sorter again; mixed inputs
retain ADR011. Relative `em`/ratio folding, slash parsing and custom text-size
theme values are not added by this ordering slice. See
[absolute metric evidence](../../docs/measurements/tailwind-absolute-text-order.md).

The v5 expansion orders further existing direct-key writes: bounded display,
position, overflow, flex basis/wrapping, box sizing, isolation, pointer events,
backface visibility, user selection and supported text decoration/alignment.
It changes only the shared ownership assessment, not runtime sorting or style
composition. Contextual display, relative text, gap/logical aliases and shared
transform registers remain barriers. See
[direct property evidence](../../docs/measurements/tailwind-direct-properties.md).

The v6 expansion assesses exact owner `[aria-…="true"]` predicates for busy,
checked, expanded, selected and the supported explicit invalid spelling. Their
original CSS specificity and emission order are shared with static and dynamic
Native output, including conjunctions with existing interaction facts. Native
does not re-bucket one canonical input by the source of its guards; a callback
is still emitted only if a resolved guard already needs interaction state.
The v7 expansion also admits exact positive `aria-disabled`, after the shared
owner-prop repair in [#1362](https://github.com/iray-tno/hozo/pull/1362). Explicit
and state-derived disabled facts now agree in props, activation and styles.
The original ARIA selector still has its own atom, not a guessed `:disabled`
substitution; conjunction multiplicity must match. Other ARIA selectors are
not approximated. See
[ARIA ordering evidence](../../docs/measurements/tailwind-aria-owner-order.md).
The additional normalized-owner comparisons are in
[disabled ordering evidence](../../docs/measurements/tailwind-aria-disabled-order.md).

The v8 expansion admits the exact upstream negations of these six boolean
ARIA predicates and proved conjunctions. Static and generated Native output
share original polarity/multiplicity assessment. Dynamic maps now encode those
negations too; the resolver prepares their underlying key/expected value once,
with no additional owner-state fields, subscription or per-render selector
parser. Missing owner facts still warn and do not apply. Non-ARIA/complex
negations remain barriers. See
[negated ARIA evidence](../../docs/measurements/tailwind-negated-aria-order.md).

For Web graph discovery, `prepareLowerModuleStyles` from compiler/lower returns
initial full-module code plus a one-shot final stylesheet continuation from the
same post-Canvas parse. The primitive handle's borrowed `preview()` does not
consume/clone/reparse that IR. Final CSS can change; changed JavaScript, CSS
identity or client-boundary structure is rejected rather than patched after
the bundler parsed it. Ordinary ready/adapter calls do not preview. This is a
staging capability, not default activation or a late-CSS loader; see
[continuation correctness and nonzero cost](../../docs/measurements/tailwind-web-style-continuation.md).

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a universal UI framework for React Native, compiled by Rust, with native semantics on every platform, first-class accessibility, and diagnostics for humans and AI agents alike. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://iray-tno.github.io/hozo/docs/getting-started/). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
