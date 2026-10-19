# Native text inheritance baseline

Tracking: [#1073](https://github.com/iray-tno/hozo/issues/1073).
This is the first measurement slice of [RFC 006](rfcs/006-native-text-inheritance.md),
not a new inheritance implementation or an accepted ADR.

## Reproduce

Use the repository's mise toolchain and install dependencies. Build the
current checkout's addon and package dependencies before capturing evidence:

```sh
pnpm --filter @hozo/compiler build:native
pnpm exec turbo run build --filter=@hozo/metro --concurrency=1
node --test --test-concurrency=1 packages/tailwind-conformance/src/text-inheritance-baseline.test.ts
node scripts/text-inheritance-baseline.mjs --rows 32 --output artifacts/text-inheritance/before.json
```

Do not reuse a stale addon after Rust changes. The report records the addon
hash but cannot prove which source built it. CI builds it afresh; provenance
includes source commit, dirty paths, Node/React/renderer/esbuild versions,
platform, fixture hash and driver hash. A dirty capture is evidence about
that working tree, not a claim that HEAD alone reproduces it.

After changing implementation, rebuild that checkout's addon/packages and
run the **same fixtures and driver** with identical dependencies and rows:

```sh
node scripts/text-inheritance-baseline.mjs --rows 32 --baseline artifacts/text-inheritance/before.json --output artifacts/text-inheritance/after.json
```

The comparison rejects different drivers, fixtures, environments, omitted
cases/stages, inconsistent support claims and incomplete workload counts.
It records newly fixed/regressed properties, per-module byte deltas and
per-operation execution/mount/commit deltas. Correctness regressions exit
nonzero. Nonzero cost deltas require review; there is no automatic timing or
performance pass. Preserve original JSON; do not overwrite the before file.
For a stress count, use `--rows 1000` in hosted CI or on an otherwise idle
machine. This mounts every requested row deliberately and is not a virtualized
feed benchmark. Genuine windowing, size-only readers, theme changes,
animations, portals and physical-device timing remain later fixtures.

CI's normal `test` job uploads `native-text-inheritance-baseline` with 32
rows, including the control and experimental reference records below. The
bounded assertions also run in the existing conformance test task.
The source inventory reads the compiler's seven inherited property variants;
Turbo and the independent source-input guard include that Rust file.

## What the first capture found

Against the unchanged production implementation, the first local capture
observed six supported scenarios and four scenarios with missing values:

| Scenario | Initial observation |
| --- | --- |
| Closed static tree, all seven properties | Supported |
| Explicit child overrides | Supported |
| Separately compiled owner and direct Text | Supported |
| Separately compiled opaque label component | Gap: color and size |
| Caller consumes a real compiler-generated owner summary | Supported |
| View with opaque label component | Gap: color and size; compiler warning retained |
| Dynamic direct label, change and restore | Supported |
| Dynamic View inline styles | Gap: color and size, including after update |
| Visible relative text under a runtime size | Supported, including after update |
| Relative text across an opaque module boundary | Gap: size, including after update |

This is a selected regression corpus, **not a 60% compatibility score**.
Expected values are explicit and separate from observed styles. Known-gap
cases do not assert that the current missing output must remain missing:
a correction becomes `supported`. Previously correct cases fail the test
if their expected values disappear. Comparisons additionally flag loss of
an individually correct property even within an already-partial case.

Cross-module fixtures evaluate separate compiled modules with explicit
fixture imports, rather than pasting the owner and caller into one source.
The manifest fixture obtains its summary from `summarizeTextForwarding`,
then hands that summary to the caller's actual compiler instance. This is
the compiler summary contract, not a filesystem project-discovery test.

## What counts mean

Only the test process replaces the simulated RN Text with a thin instrumented
component. All generated and runtime imports receive the same Text identity,
so direct-child recognition still uses the real primitive's check. No shipped
component or shared stub changes. Counters record instrumented Text function
executions and effect mount/unmount counts, keyed by stable fixture testID.
They do not count every Hozo helper's executions or hook subscriptions.

React Profiler records subtree commits, not render executions or native
commits. The workload distinguishes:

- A parent updating with stable children: no extra Text executions/commits.
- Reconstructed children: ordinary parent-driven executions, not inferred
  context notifications.
- Pressing/releasing one actual compiled button: its Text updates, siblings
  do not, and the existing host identity survives.
- Unmount: all measured effect lifetimes balance, with no extra mounts
  during state/parent changes.

The tests drive the existing owner event handlers. They verify the pressed
blue color and restored red color, not just a green lifecycle counter.

## What this does not establish

This executes real compiler/Metro output and real Hozo React code, but uses
simulated RN hosts. Observations are styles applied to a host Text, not native
computed inheritance. In particular, the stub does not emulate native
Text-to-Text inheritance; absence of an applied prop there is not proof of a
visual defect. The selected gap fixtures require explicit resolved values
across View/Pressable boundaries or for relative calculations, where native
Text inheritance does not supply the required number.

No native layout, pixels, AT behavior, animation fidelity, production/Hermes
timing, memory allocation, native commit count, actual subscription count,
Metro bundle size or tree-shaking result is measured. Per-module byte counts
cover transformed source and esbuild-minified JS, not an application bundle.
Development Text instrumentation adds work and is unsuitable for timing claims.

The original capture is baseline **A** only. The subsequent experimental B
below is still not a complete reference implementation; a full optimized C and a
browser-computed-style oracle do not exist yet. There is no evidence
justifying default rollout. RFC 006's correctness, timing and physical-device
acceptance requirements remain unchanged.

## Experimental Context reference (test wiring only)

Tracking: [#1076](https://github.com/iray-tno/hozo/issues/1076).
`text-inheritance-reference.ts` lives in the private conformance package.
It is not exported by engine/primitives or selected by production compilation.
The later private diagnostic story below uses its shared core explicitly;
normal application compilation and runtime imports are unchanged.
The driver explicitly substitutes generic Text/View and the generated
Pressable leaf only when running `--mode reference`:

```sh
node scripts/text-inheritance-baseline.mjs --rows 32 --output artifacts/text-inheritance/control.json
node scripts/text-inheritance-baseline.mjs --rows 32 --mode reference --baseline artifacts/text-inheritance/control.json --output artifacts/text-inheritance/reference.json
```

Re-capture both records with this same driver. Current records use schema 4;
earlier schema-1/2/3 artifacts must not be silently paired with this driver.
Schema 4 records both the Node adapter and its portable core dependency,
including source, hashes and minified module bytes. The comparison sums both
modules; extracting the core must not make its cost disappear. These are
separately minified source-module totals, not tree-shaken application bundle
sizes. Baseline remains the
default; there is no application
setup flag or public API for this experiment.

The reference separates paint (color) from six metric/typographic fields,
memoizes effective scalar values, and bridges the resulting numeric size to
the existing `HozoTextSizeContext`. It adds no native host or event listener.
For Pressable it keeps the real event machine, consumes the compiler's label
callback once instead of the direct-child forwarding, and publishes the
resolved result rather than lending a child an interaction predicate. The
same package entry supplies its interaction Context: importing a raw source
Context alongside the primitive's built entry would produce two identities
and silently read idle state. A driven opaque-label test guards this.

For the original ten cases, the prototype observes eight supported and two
with gaps. The newly supported cases are a separately compiled opaque label
inside Pressable and dynamic View inline typography, including updates.
The remaining cases are deliberately still visible:

- The static View's typography was already removed by lowering. A runtime
  provider cannot recover information absent from its props.
- The separately compiled relative Text already contains a folded font size
  of 12. Context cannot identify it as a ratio or override it without also
  breaking an author's explicit size. The compiler must retain that intent.

The existing uncompiled Small component can read the bridge: with the runtime
project's default preflight it follows 20 -> 16 and 30 -> 24, while an explicit
9 remains 9. This is distinct from the compiler-only bare-UA fixture, whose
ratio is 1/1.2. No reset/relative-metric compatibility expansion is claimed.

The workload now includes separately compiled memoized opaque labels as well
as the existing closed labels. In the opaque control, a press does no Text
work **because its typography does not update**; in the reference, the target
Text updates correctly and siblings do not. `workloadSupport` labels this as
unequal-feature work, not an equal-work speed comparison.

The evidence retains `referenceExecutions` per fixture stage/workload
operation in addition to Text counters. For example, even a closed label
can incur extra reference Pressable/LabelScope/Scope function executions
without increasing Text executions. The added reference module's source,
hash and minified bytes are recorded separately: unchanged generated module
bytes do **not** imply zero runtime cost. Those helper bytes include counting
instrumentation and test imports, not a production bundle-size prediction.

Tests also demonstrate the limits of ordinary Context:

- A color-only update skips memoized metrics-only and legacy-size readers;
  a general Text still updates through `memo`.
- Equal values with fresh style objects do not notify unchanged readers.
- An overriding inner scope shields its descendants; removing the override
  restores inheritance without a remount. Undefined local Text fields also
  resume inheritance while preserving unrelated styles.
- A generic Text reading paint still executes on an ancestor color change
  even if its own color masks that change. The reference test records this
  over-subscription rather than pretending it is free or already optimized.
- Nested controls keep separate real interaction owners.

This prototype rejects animation-enabled owners, host style callbacks
(including generated ones not modeled here), and non-scalar inherited values
instead of certifying them. Only the separate compiler label callback is
consumed. It does not
recover relative descriptors or include the native unknown-host, portal,
pattern-slot, full generated-Text-helper and animation contracts. Raw native
Text outside compiled fixture imports does not participate automatically.
There is no selector store, monkey patch of RN, production provider insertion
or per-frame Context traffic. Next work is proof-based retention/elimination
of reads/publications plus the missing compiler intent, with paired timing
and physical-device evidence still required before adoption.

## Paint-read elimination experiment (partial C)

Tracking: [#1078](https://github.com/iray-tno/hozo/issues/1078).
This remains private test wiring, not an author API or an enabled compiler
path. `text-inheritance-static-proof.ts` inspects the actual post-Metro JSX
AST using the existing Babel dependency; it is a bounded proof experiment,
not another production lowering pipeline. It selects a fixed `PaintMaskedText`
helper only for an unconditional inline literal color, with no prop/style
spread, computed key, getter, duplicate field or unresolved class. Arrays,
registered styles and dynamic/absent colors conservatively keep reference B.
It neither evaluates an expression to guess its value nor registers wrapper
components. Authored expressions are still evaluated once.

There is a second proof obligation: **component identity**. Two conditional
Text sites can occupy one React position. Changing only one site's helper
type would remount its stateful children when the branch changes. This first
experiment therefore accepts only an unconditional Text root in an inline
canonical `React.memo` render function. Other roots/render helpers retain B;
using memo is **not required for correct inheritance** and is not a proposed
Hozo authoring restriction. A live branch-change/state test guards the
fallback. Wider elimination needs an equally strong identity proof, not a
longer list of component names. No hook is selected from a current style value.

The selected helper omits only its Paint read. It still reads Metrics,
publishes the resolved local paint to opaque descendants, and bridges the
same numeric size to the legacy size context. An explicit color or font size
does not prove that the other metric fields or descendant providers are
unnecessary. No provider or metric read is eliminated in this slice.

```sh
node --test --test-concurrency=1 packages/tailwind-conformance/src/text-inheritance-static-proof.test.ts
node scripts/text-inheritance-static-proof.mjs --rows 32 --output artifacts/text-inheritance/static-proof.json
```

The separate B/C artifact (its own schema 1) records the control, optimized
ten-case corpus and both original button workloads, plus a masked-color
workload with separately compiled memoized labels and opaque descendants.
Each attempted Text proof retains its source span, subject, disposition and
reason. Modules retain both the original Metro lowering and the experimental
executed source, with byte counts. Proof/driver hashes and Babel version
supplement the control's provenance. CI uploads it beside the current A/B
records; these formats are not interchangeable.

At 32 rows, a color-only ancestor update changes masked host-Text-wrapper
executions from 32 to 0. The opaque descendant host wrappers execute 0 in
both versions, and all seven applied properties remain equal to independent
expectations. Metrics changes still update both levels, and every measured
lifetime mounts/unmounts once. The original corpus remains 8 supported / 2
gaps: the static View information loss and folded relative intent are not
fixed by this proof. Closed compiler output and real button-owner event
behavior remain unchanged.

**Zero host-wrapper executions is not zero React work.** In this workload
React can attempt an opaque descendant reference function, then bail out
before executing its host wrapper. At 32 rows, the color-only update still
attempts 32 descendant reference functions in C, versus 64 reference Text
functions across both levels in B. The artifact retains these counts and
render-time Context-read hook invocation counts; neither counts live
subscriptions, native work or time. Mounting removes 32 Paint read calls but
keeps the same Metrics read count. This is deterministic work reduction, not
a measured speedup or a production bundle-size improvement.

StrictMode, dynamic override removal and single-evaluation checks run in
tests. Abandoned/concurrent renders, animation, portal ownership, actual
browser/native rendering, production timing and a default rollout remain
open. This partial C does not establish RFC 006 acceptance or an ADR.

## Retaining compiler intent (expanded reference, still opt-in)

Tracking: [#1082](https://github.com/iray-tno/hozo/issues/1082).
The `reference-intent` capture pairs the same private Context hosts with an
**internal** native compiler experiment. It is not a Metro/project setup
option or a production fallback. Ordinary `compileNative` and the default
`compileNativeModule` route stay unchanged, including after experimental
calls on the same compiler instance. The internal fourth-argument test
option is not an accepted generated-code ABI; its output must not be used
with bare RN hosts.

The compiler's existing parse/lower walk retains two previously lost inputs:

- A plain View's own resolved typography is retained on its experimental
  style so ReferenceView can publish it. Normal output still forwards
  declarations to visible text and diagnoses opaque descendants. In a final
  implementation, owner typography needs a deliberate helper/prop ABI, not
  unsupported text-style keys passed to bare RN View.
- A separately compiled relative root retains its semantic ratio instead
  of folding against an assumed 14. The reference conservatively treats
  root ancestry as opaque, using the existing HozoRelativeText implementation.
  Its private adapter binds only that implementation's RN Text import to
  ReferenceText, so the resulting size also reaches metric readers and
  opaque descendants. The ratio calculation is not reimplemented in the
  harness. Existing explicit-size precedence remains in effect.

Inherited declarations are not copied into Text in this reference route:
such a copy could override the runtime parent's later inline style or the
relative helper's computed size. Pressable publishes its resolved label
style even for visible Text, using the same real interaction owner and one
callback evaluation. None of these changes run in default compilation.

```sh
node scripts/text-inheritance-baseline.mjs --rows 32 --mode reference --output artifacts/text-inheritance/reference.json
node scripts/text-inheritance-baseline.mjs --rows 32 --mode reference-intent --baseline artifacts/text-inheritance/reference.json --output artifacts/text-inheritance/reference-intent.json
```

Rebuild the addon **and** compiler JS first. Schema 3 records the selected
compiler experiment and the source/hash/minified bytes of the relative
adapter and actual primitive source, beside the original reference helper.
Comparisons validate that evidence and report its bytes separately. The
actual primitive source is recorded in **every** mode because the ordinary
relative fixture already uses it; only the private adapter is newly added
in the intent experiment. These source payloads are not bundled-app costs.
Existing relative helper functions themselves are not instrumented by the
reference execution counters; their selected imports/source remain visible.
The existing partial-C paint proof continues comparing its original reference;
it does not silently relabel the new compiler experiment as the old driver.

For the selected original ten cases, this reference observes 10 supported
versus 8 in the earlier reference (and 6 in ordinary production output).
The newly passing View and cross-module relative cases include live size
updates. Additional checks cover inline style overriding a parent's static
class, nested relative sizes, opaque metric descendants, local explicit
sizes, current color, and balanced effect lifetimes. Both button workloads
retain actual-owner press/release behavior and no sibling Text updates.
This is a regression corpus, **not 100% compatibility** or a production fix.

The conservative reference deliberately gives up static folding at open
roots and can add helper calls/bytes even where the existing path was already
correct. Per-stage counts and generated modules remain in the artifact;
unchanged default output does not imply the experiment itself is free.
Proof-based recovery of closed-static output is still required before a
rollout. Physical-device timing, browser-computed-style validation, relative
line-height/em-spacing descriptors, animation, pattern/portal ownership and
abandoned/concurrent-render behavior remain open. Raw third-party Text is
still outside the protocol. No default enablement or ADR acceptance follows.

## Complete Text leaves (bounded private fast path)

Tracking: [#1085](https://github.com/iray-tno/hozo/issues/1085).
The next partial C compares against `reference-intent`, not the earlier
eight-case reference. A private post-Metro analysis may restore the ordinary
RN Text binding only when every use of that module's Text imports is a
proved leaf: all seven own properties are supported unconditional inline
scalars, children are literal text, and the render root has stable canonical
React memo identity. The identity guard is shared with the paint experiment.

Mixed open/closed uses, escaped bindings, namespace/default native imports,
native reexports and opaque module access keep the contextual binding.
Dynamic or partial styles and opaque descendants also keep it. This is not
an authoring restriction: failed proof means runtime inheritance, not an
error or lost styles. The initial slice did not prove registered or class
styles (extended below). Even an entirely specified parent Text must publish
its frame when an opaque child might consume it.

```sh
node --test --test-concurrency=1 packages/tailwind-conformance/src/text-inheritance-closed-proof.test.ts
node scripts/text-inheritance-static-proof.mjs --kind closed-leaf --rows 32 --output artifacts/text-inheritance/closed-text.json
```

The separate schema-1 report keeps all ten selected reference cases, both
button workloads and a new paired workload with complete, partial, open,
opaque-owner and opaque-child Text per row. Seven applied properties have
independent expected values through color/metrics updates and restoration.
The report validates these, balanced lifetimes and the binding decision
before declaring itself validated; it does not only count successful renders.

At 32 rows, ancestor color/metrics changes and restoration execute the
complete leaf's host wrapper 32 times in B and zero in C. Each of the three
Context-read hook counters, ReferenceText and Scope executes 32 fewer times
on mount and these updates. The partial and open hosts still execute once
per row when the frame changes. Equal values and unrelated parent styles
produce no host-wrapper executions in either version; a changed label prop
still updates the complete leaf. StrictMode/state retention, dynamic override
removal and single authored evaluation are separate regression tests.

No source is rewritten and no new render helper is inserted: the test loader
changes only the proven module's Text binding, leaving View contextual. All
six workload modules retain identical lowered source and minified byte
counts. The artifact records that loader decision and proof/boundary/driver
source hashes so unchanged bytes cannot hide different executed wiring.
This is not a production bundle-size result, measured speedup, native commit
count or claim of zero React work for the enclosing tree.

The selected corpus remains 10 supported / 0 gaps, not a compatibility
percentage. Whole closed-tree/provider elimination, broader style proofs,
production compiler integration, concurrency/portal/animation checks and
physical-device performance remain open. This experiment does not satisfy
RFC 006's full static-output gates or enable a production default.

## Class-generated registered styles (private follow-up)

Tracking: [#1088](https://github.com/iray-tno/hozo/issues/1088).
The same closed-leaf proof now recognizes module-local `const` registries
created by the trusted RN `StyleSheet.create` import and literal style arrays.
It consumes actual post-Metro style output; it neither parses Tailwind again
nor executes expressions during analysis. Literal array layers merge in RN
source order. Unknown layers are never skipped; a final undefined/dynamic
field cannot be certified from an earlier complete frame.

`const` alone does not prove an immutable object. Registry references must
be static member reads in trusted RN Text style props. Mutation, deletion,
export, aliasing, unknown consumers and a changed/escaped StyleSheet import
retain the contextual binding. Registries with spread/getter/computed or
nonliteral definitions are also unproved. This deliberately does not handle
imported registries, `StyleSheet.flatten`, dynamic array layers or arbitrary
style objects. None is an authoring error; all keep runtime fallback.

```sh
node --test --test-concurrency=1 packages/tailwind-conformance/src/text-inheritance-style-proof.test.ts
node scripts/text-inheritance-static-proof.mjs --kind registered-leaf --rows 32 --output artifacts/text-inheritance/registered-text.json
```

The additive schema-1 report identifies its registered-style workload with
`kind: test-only-registered-text-fast-path` and `styleForm: registered`.
It retains sources/hashes of the style proof as well as the shared closed
proof and driver. The original inline and paint captures remain separate.
Both sides execute the same actual class lowering, including a final inline
color different from the class color, so independent expected styles test
precedence rather than merely agreeing on identical declarations.

At 32 rows, the registered workload retains all ten selected cases and both
button workloads. Complete-leaf ancestor color/metrics/restoration host
executions fall 32 to zero; each Context-read hook counter and ReferenceText/
Scope invocation count falls by 32 on mount and those updates. Partial/open
readers remain live, the opaque owner still publishes, and lifetime counts
remain balanced. All six modules keep identical transformed/minified bytes
between contextual and optimized runs; no source is rewritten. Separate
tests cover override removal, host/state retention with and without
StrictMode, and single authored evaluation outside StrictMode.

These are simulated-host work counts, not device speed or a production
bundle-size change. Production integration, whole-tree elimination and the
remaining concurrency/portal/animation/device gates are still open. No
default enablement or ADR acceptance follows.

## Self-contained nested Text (private region proof)

Tracking: [#1092](https://github.com/iray-tno/hozo/issues/1092).
`closed-subtree` is a separate experiment, not a broader meaning silently
assigned to the leaf captures. It permits literal text, structural fragments
and directly nested trusted RN Text inside a stable memo render root. Every
Text must independently own all seven supported scalar fields. The existing
module-wide import-use coverage, registered-style mutation/escape checks and
identity guard still apply. One partial/dynamic Text, opaque component,
spread or unknown child expression retains the contextual module binding,
including its parent. Named Fragment components, View descendants, imported
component bodies and conditional child trees are not proved by this slice.

This intentionally does not fold a parent's values into a partially styled
child or add another inheritance evaluator. Known child syntax alone is not
proof that the child does not need the parent's published frame. No source
rewrite or new render helper is needed for the independently complete case.

```sh
node --test --test-concurrency=1 packages/tailwind-conformance/src/text-inheritance-subtree-proof.test.ts
node scripts/text-inheritance-static-proof.mjs --kind closed-subtree --rows 32 --output artifacts/text-inheritance/closed-subtree.json
```

The schema-1 report uses `kind: test-only-self-contained-text-subtree` and
`styleForm: subtree`. Each row adds a nested Text with a different independent
seven-property oracle, for six Text hosts per row. Paired operations compare
the simulated host hierarchy, scalar child order and accessible role/name
props as well as applied styles and balanced lifetimes. The same structural
comparison also strengthens the older inline/registered captures. These are
not device layout, text shaping or screen-reader measurements.

At 32 rows, ancestor color/metrics/restoration changes reduce the closed root
host-wrapper executions 32 to zero. Nested host executions are already zero
in B and remain zero in C: do not count that as a new rendering saving.
Metrics/Paint read-hook calls and ReferenceText function invocations fall by
64. Scope invocations and legacy-size read calls fall by 64 on mount, metrics
changes and restoration, but only 32 for a color-only change. The reference
can attempt a nested helper and then bail out before reaching its Scope or
host; these counters are deliberately separate. The remaining contextual
View and open controls still perform work.

All ten selected cases, button-owner workloads, independent styles and six
module byte counts remain equal between B/C. Equal-value/unrelated parent
updates execute no host Text wrappers; a changed label prop still executes
both closed root and nested host once per row. Tests also cover normal and
StrictMode host/state identity, authored evaluation and removing a dynamic
child override back to its actual owner's frame rather than an outer View.

This remains private loader wiring. Partial-frame static inheritance,
whole View/provider elimination, production integration, concurrency,
animation/portal ownership and physical-device performance gates remain open.
No production default or ADR acceptance follows.

## Shared reference and Native comparison preparation

Tracking: [#1100](https://github.com/iray-tno/hozo/issues/1100).
The algorithm now lives in `text-inheritance-reference-core.ts`. A factory
receives React, RN-shaped hosts, the existing size/interaction Contexts and
style flattening. It has no runtime imports or Node API. The Node adapter
retains instrumented hosts and all existing entry points; the Native adapter
instantiates the same factory once at module scope with the app's React and
actual RN hosts. Metrics/Paint contexts and counters belong to that instance.
It is not a public engine API or a production fallback switch.

The app uses React 19.2.3/RN 0.86.3, while the Node reference currently uses
React 19.2.8/RN 0.87.1. React injection prevents accidentally bundling the
conformance package's different React. The RN 0.87.1 source fingerprints above
are not evidence that the app's RN version renders identically. The Native
adapter consumes owner typography before removing those seven fields from
the RN View's host style; it preserves layout styles and adds no native host.
Node simulated-host declarations remain unchanged.

The local pre/post extraction check retained all ten selected case records
and both workloads exactly, including lowered modules, helper/host execution
counts and lifetimes (`reference-intent`, 32 rows). The separately minified
Node reference went from 3,172 bytes to 3,988 bytes for adapter plus core
(+816 bytes). That is private module/factory wiring cost, not an app-bundle or
device-time result. The addon was rebuilt at current main after the pre-check
(an intervening Web-only change), so this cross-schema inspection deliberately
does not claim identical binary provenance or use the paired comparison API.

`Diagnostics/Text inheritance/Comparison` is a preparation fixture with three
panels: ordinary compiled RN Text, Context reference, and proof-selected Text.
Its author source is `packages/tailwind-conformance/fixtures/native-text-label.tsx`.
The generator runs the actual Metro/compiler path and existing native-region
proof. A complete static root with partial nested Text gets `plain-native`;
a runtime root style gets `context-fallback`. The compiler bodies are equal
between ordinary/reference modes for this bounded fixture. No style value at
render time selects a component identity. Generated bodies and hashes are
committed, with a unit staleness check:

```sh
node examples/native-showcase/scripts/generate-text-inheritance.mjs
node examples/native-showcase/scripts/generate-text-inheritance.mjs --check
node --test --test-concurrency=1 examples/native-showcase/scripts/text-inheritance.test.mjs
```

Each case has mount identity in its accessible label. Case switching starts
a new comparison; ancestor changes, label updates and restoration within one
case must preserve identity. All three panels share an experimental owner
scope so this screen is not a performance comparison against the production
ordinary app tree. State/prop tests use mock RN hosts and explicitly do not
simulate nested native inheritance.

When run on a device, actual `onTextLayout` callbacks log `[Hozo text layout]`
records with line metrics, source/core hashes and React/RN versions. Request
labels are not certified native-frame epochs: callbacks can be queued. The
records deliberately say `verdict: not-assessed`. They do not infer font color
or weight, rendered pixels, accessibility behavior or elapsed performance.
Synthetic unit callbacks validate the record shape only. No emulator run,
native span/layout equivalence or physical-device measurement is established
by preparing this story. A later Android driver must collect independent
evidence and source/binary provenance before reporting those results. Existing
Showcase full/release scenarios and production defaults remain unchanged.

## Partial descendants using RN's own nested-Text inheritance

Tracking: [#1097](https://github.com/iray-tno/hozo/issues/1097).
Ordinary compilation does not copy every parent's attribute into a nested
Text's style. RN already carries text attributes down its attributed-string
tree. A separate `native-region` experiment permits partial static Text
descendants below a complete static seven-property root, without a new
compiler inheritance calculator or a source rewrite. The root must satisfy
the stable memo identity guard and mask unknown ancestor values. Every Text
use still needs coverage; dynamic styles, opaque children, View boundaries,
relative helpers, spreads and unsupported local fields retain Context.

```sh
node --test --test-concurrency=1 packages/tailwind-conformance/src/text-inheritance-native-region.test.ts
node scripts/text-inheritance-static-proof.mjs --kind native-region --rows 32 --output artifacts/text-inheritance/native-region.json
```

This experiment needs a different observation from the earlier flattened
props check. The instrumented host remains unchanged: it does not simulate
native inheritance. `actual` still records the styles passed to host Text.
The new `projectedNativeAttributes` field is explicitly a **prediction**, not
an observed native-renderer value. A test-only seven-field projection walks
the simulated host tree, lets the closest Text override its parent, and
resets at View/other hosts. Independent expected values, a negative View
boundary control and unchanged host grouping check this bounded projection.
It does not model font shaping, paragraph/layout behavior, scaling, colors
after native processing, other inherited fields, pixels or accessibility.

The uncached standalone command also checks the installed RN source shape
and records its version plus four source-file SHA256 hashes:
`Text.js`, `BaseTextShadowNode.cpp`, `TextAttributes.cpp`, `BaseTextProps.cpp`.
In the observed RN 0.87.1 source, nested Text uses NativeVirtualText;
buildAttributedString copies the base TextAttributes and applies local
attributes; apply retains the parent when the local attribute is absent.
All seven property mappings are present. This is source evidence, **not
execution of RN's JS/C++ or a device test**. These uncached capture checks do
not add hidden external-source reads to the Turbo unit-test task.

The report distinguishes `kind: test-only-native-text-inheritance-region`
and `styleForm: native-region`, retaining model/proof sources and hashes.
A separately compiled ordinary module is also recorded: its transformed
source and minified bytes exactly equal the optimized Text module. That is
an evidence control, not an additional production compilation pass.

At 32 rows, the same work-count deltas as the self-contained subtree apply:
root host executions 32 to zero on ancestor changes, nested hosts already
zero in B and still zero in C, and Metrics/Paint read calls plus ReferenceText
invocations reduced by 64. Scope/legacy-size calls fall by 64 on mount,
metrics changes and restoration, but 32 on color-only changes. Partial/open
controls outside the region remain live. Ten selected cases, button-owner
workloads, host grouping and lifetimes remain equal.

The nested host's actual style now deliberately omits fontSize and other
inherited metrics; the reference passed a complete resolved frame. Both
seven-field projections match independent expected values. Raw declarations
for every other host remain equal. State/host identity and authored evaluation
are tested with and without StrictMode; an opaque View plus a removed dynamic
override is checked using actual contextual host props, not the projection.

Only Hozo's inheritance helpers are omitted. RN's own TextAncestorContext
remains, so this is not a zero-Context or measured-speedup claim. Native/device
verification of this path, broader static regions, View/provider elimination,
production integration and the remaining animation/portal/concurrency gates
remain open. No production default or ADR acceptance follows.
