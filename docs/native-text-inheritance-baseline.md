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

## Opt-in Android rendering comparison

Follow-up: [#1102](https://github.com/iray-tno/hozo/issues/1102). The same story
can reveal each mounted binding at the same position. A separate mode-color
marker, excluded from the Text crop, verifies screenshot presentation rather
than treating AX labels as presented text. A dedicated hosted run uses
`platform=android`, `android-scenario=text-inheritance`, diagnostics off and a
fresh build. It is not part of full/SVG/release gates.

The driver measures initial, ancestor change, label update and restoration
for both static and runtime-style cases and all three bindings (24 samples).
It checks retained mount IDs, nonblank root/nested paint, exact same-device
glyph-region pixels/dimensions, static shielding, runtime color/height change
and restoration. It never rescales/translates/blurs crops or ignores differing
pixels. A mismatch fails and retains screenshots, AX, source/fixture/APK hashes,
callback logcat and partial results. No failing interaction is replayed.

These are bounded visible-region comparisons, not a native attributed-span
inspection, complete seven-property or paragraph-shaping conformance, physical
device throughput, iOS/AT evidence or a production rollout gate. Requested
state labels are distinct from pixel measurements; onTextLayout records still
say not-assessed. Mock-host and synthetic pixel tests validate the harness
only. An actual hosted run and its artifacts must be reviewed separately.

The first dedicated Android run was reviewed after #1103: all 24 states and
40 intended comparisons passed, with independently re-cropped screenshots
and a matching APK hash. See [the pinned measurement](measurements/native-text-inheritance-android.md)
for source/run identifiers, observed bounds and limits. This is not iOS or
opaque-View inheritance evidence and does not accept RFC 006.

The iOS follow-up (#1105) selects `platform=ios`,
`ios-scenario=text-inheritance`, diagnostics off, no reuse/rebundle. It uses
the same fixture, 24-state driver and exact comparator, with an AX-points to
Retina-pixels adapter. Measured point/pixel/screen/marker bounds remain in the
artifact; inward rounding excludes boundary pixels rather than resizing or
blurring glyphs. Geometry mismatches fail instead of guessing a scale.
Fresh archive/source/run checks precede input. Archive and JS bundle hashes,
raw screenshots, AX and syslog remain in the ordinary iOS evidence artifact.
Full/SVG/Canvas/release defaults and deadlines are unchanged. Synthetic
adapter tests are not CoreText results; a dedicated Simulator result still
needs artifact review, and no production default changes.

The corrected-source dedicated iOS run 39305398979 was independently reviewed:
all 24 saved PNG/AX pairs, 40 comparisons, 32 acknowledged actions and the
downloaded archive/extracted JS-bundle hashes matched. The earlier unit-test
failure is preserved separately. See [the pinned iOS measurement](measurements/native-text-inheritance-ios.md)
for versions, dimensions and limits. The existing runtime fixture passes its
frame as a prop; opaque View propagation without that prop and performance
acceptance remain separate work. RFC 006 is still Draft.

## Opaque View propagation without inherited props

Follow-up: [#1112](https://github.com/iray-tno/hozo/issues/1112). The private
device fixture adds a third label from a separate authored source with no
root typography or `frame` prop. Its real lowered output fails the complete
region proof, retaining Context. A separately compiled, memoized wrapper adds
an ordinary RN View and forwards only label identity/tick/callback props to
the reference and optimized labels. The callbacks remain stable across
ancestor-only updates so they cannot force a render through the memo boundary.

The ordinary comparator deliberately uses the existing explicitly styled RN
runtime label, not a Context reader; the manifest records that distinct source
and compiled hash. All modes have the same authored View boundaries. Reference
and optimized labels must update from Context while the wrapper bails out,
apply a local owner override, resume ancestor inheritance when it is removed,
and retain label state through updates/restoration. This exercises the initial
seven-field frame, not every supported typography combination or third-party
host internals.

The dedicated scenario now retains the original 24 static/runtime states and
adds 18 opaque states: initial, ancestor change, label update, local override,
override removal and restoration across three bindings. The same strict crop,
ink, marker and equality gates check **42 states / 67 intended comparisons /
56 acknowledged actions**. Applying the complete local override must restore
initial pixels despite the changed outer owner; removing it must recover the
changed ancestor pixels. No failed input is replayed.

Mock-host tests verify frame omission, propagation below a memo bailout,
override removal and state identity. Synthetic images verify failure retention
for opaque-only ignored inheritance/overrides, not actual glyphs. Fresh
Android/iOS runs and their archive/PNG/AX review are still required before
claiming the expanded device result. Full/release defaults and production
behavior remain unchanged. No performance or ADR acceptance follows.

## Suspended and abandoned React renders

Follow-up: [#1114](https://github.com/iray-tno/hozo/issues/1114). A small separate
test suite injects mock host names and real React contexts into the same
portable core. It uses actual `startTransition` and Suspense promises, not
timers or a simulated Context implementation. It does not depend on an
unreviewed success from the expanded Android/iOS pixel scenario.

```sh
node --test --test-concurrency=1 packages/tailwind-conformance/src/text-inheritance-concurrent.test.ts
```

With and without StrictMode, a new seven-field ancestor frame is actually
read before a descendant suspends. The last committed host style and frozen
metric/paint records must stay unchanged while pending. A separately forced
read in another root must still see its own default contexts. On successful
release, metrics, paint and the legacy numeric size must commit coherently;
on an urgent superseding update, releasing the abandoned promise must never
commit the stale frame. Removing a local color/size override while suspended
must preserve the old committed override until inheritance resumes at commit.

Render-read logs deliberately include speculative work. Layout-effect records
are the committed observations; the two are not interchangeable. Mock-host
identity, host grouping, label state tokens and effect lifetimes must survive
each transition. StrictMode's initial effect replay is part of each test's
baseline, not reported as extra mounts caused by an ancestor update.

These are six bounded React-level scenarios on the conformance workspace's
React/renderer, not native glyphs, React Native commits/subscriptions, Hermes
or physical-device performance, a proof of all concurrency interleavings,
portal/animation coverage or a production/ADR rollout gate. In particular,
the app's separately installed React/RN versions still require their own
device evidence. No timing thresholds or shared helper behavior change.

## Production-owned internal opt-in

Follow-up: [#1117](https://github.com/iray-tno/hozo/issues/1117). Engine now
owns the seven-field, immutable metrics/paint protocol. Primitives owns
`HozoInheritedText` and `HozoInheritedView`; compiler output reaches them
through generated-code leaves. The legacy numeric-size bridge uses the
existing engine Context singleton through a narrow leaf, not another copy
or the whole engine barrel. No author-facing Provider, project configuration
or root component export is added.

The per-call internal compiler selection `{ textInheritance: true }` is
separate from `{ textReference: true }`; selecting both is an error. Ordinary
compilation before and after either call remains unchanged. Production code
does not import the private reference or its instrumentation. The reference
is kept independent so differential agreement is not a comparison of one
implementation against itself.

This slice assesses passive Text/View graphs with numeric resolved font
size, line height and letter spacing, string/number weight/color, and text
alignment/transform. It accepts ordinary static classes and inline style
arrays/records, including opaque separately compiled memoized children.
The same rendered graph must participate in the protocol; raw third-party
text owners and mixed-mode graphs are not claimed to inherit correctly.
The View publishes its effective frame before removing text fields from
its native host. Both compiler-inserted text and runtime raw scalar
children read that frame. Providers introduce no native wrapper boxes.

Conditional/dynamic classes, animations/transitions, relative metric
declarations, font families/variants and extra generated adapters are not
assessed. Such compiler roots retain ordinary output and gain an explicit
internal-experiment error, rather than being counted as integrated. Opaque
style callbacks, Animated/object colors, non-finite metrics and font
family/variant/style records fail explicitly at the experimental leaf.
These are restrictions on the internal experiment, not new restrictions on
ordinary Hozo authoring. Runtime values must already be resolved RN styles;
the protocol is not another Tailwind or CSS resolver.

```sh
node --test --test-concurrency=1 packages/compiler/src/text-reference.test.ts packages/engine/src/text-inheritance.test.ts packages/tailwind-conformance/src/text-inheritance-runtime.test.ts packages/tailwind-conformance/src/text-inheritance-concurrent.test.ts
```

The actual compiler/Metro path and shipped leaves are executed with mock
Native hosts. A separately compiled memoized label receives no forwarded
frame prop; seven fields update through Context, local overrides can be
removed, state and refs survive, and the existing layout handler remains
on one existing host. A raw-string regression checks that static owner
classes do not mask later inline overrides. The suspended/abandoned-render
suite now runs against both independent implementations, including
StrictMode, sibling-root isolation and coherent legacy-size commits.

This is a conservative runtime-only route when opted in: private
proof-based static erasure is **not** ported here. Generic Text still reads
both channels and each helper retains a stable provider shape. These mock
tests establish neither native glyph/pixel equality for the new production
leaves nor Hermes/physical-device performance. Earlier private-reference
device results cannot certify changed production code. Typography,
interaction, animation and portal integration, static erasure, actual
device comparison and performance review remain before default rollout
and an accepted ADR. RFC 006 remains a draft.

## Production Native comparison preparation

Follow-up: [#1123](https://github.com/iray-tno/hozo/issues/1123). The isolated
Native story now retains all three earlier controls and adds a fourth
`production` panel. A real internal compiler/Metro call generates each
production label with imports of the shipped Text ABI. Its factory has no
Text injection parameter, and its owners use the shipped View ABI rather
than the reference's Context. The opaque memo/View boundary receives no
frame prop for production, exactly as for the two contextual controls.

Manifest v2 records the twelve production source/forwarding dependencies
and the three production compiled-output hashes separately from the
reference core and static-proof hashes. The production route is explicitly
runtime-only even in the complete static case; private proof success does
not select its binding. Ordinary compilation and full/release scenarios
remain unchanged.

The shared Android/iOS screenshot driver now intends **56 observations /
94 comparisons / 70 acknowledged actions** across four modes. The fourth
presented-frame marker has its own color. Same-position exact pixels,
source-colored ink, static shielding, ancestor color/height change, local
override/removal, restoration and within-case mount identity remain
required. Synthetic negative tests corrupt only the production panel,
including opaque-only inheritance/override/state failures: earlier
successful controls cannot hide them. Input failures are not replayed.

Mock tests bundle the actual production engine and primitives source with
the app's React and mock RN hosts; the private reference stays independent.
They establish wiring/state invariants, not Native pixels. Fresh Android
and iOS builds and independent archive/PNG/AX review are still required for
this new code. Previous 24- or 42-state reference evidence cannot certify
the fourth panel. Physical-device performance, static erasure, broader
ownership integration and ADR/default acceptance remain separate work.

## Production Native evidence reviewed

The [production measurement review](measurements/native-text-inheritance-production.md)
completes the raw evidence portion of #1123 and the opaque memo/View slice
in #1112. Fresh run [39365177992](https://github.com/iray-tno/hozo/actions/runs/39365177992)
used source `83d96d9c32da00ba312eb16920e790ea58272728` on both platforms.
An independent offline reader recalculated all 56 PNG/AX states and 94
comparisons per OS (86 equalities, eight intended changes), checked 70
actions and stable within-case tokens, and hashed the actual APK, Simulator
archive and archived JS bundle. All matched. Ten representative production
screenshots were also visually reviewed; this is not manual inspection of
every capture.

These results supersede the pending-review statement above for this pinned
fixture, not for later changed code. Production still uses its conservative
Context route even in the complete static case. Static-erasure integration,
broader owner coverage and performance remain separate from this bounded
rendering result. No default/API change or ADR acceptance follows.

## First production static-region selection (internal)

Follow-up: [#1135](https://github.com/iray-tno/hozo/issues/1135). An additional
per-call internal selection `{ textInheritance: true, textStatic: true }`
tries the first production static proof. `textStatic` without the production
experiment is an error; it is not a project/Metro setting or a new public
Provider. `{ textInheritance: true }` alone retains the independently
measured runtime-only route, and ordinary/reference calls remain unchanged.

The parser reuses its existing AST, with a semantic binding pass only on
this explicit selection. It requires an actual imported React `memo`
render function with a fixed returned Text root (a concise arrow, or local
variable declarations followed by one final return). A named render
function must not escape/recurse. Every direct child must be literal text
or another imported Text. Names alone, shadowed/type-only/mutated imports,
alternate returns, opaque expressions, fragments and View boundaries do
not establish this proof. No second source parse or application expression
execution is used. Ordinary parsing does not build these proof facts.

The Native backend separately requires all seven root fields to resolve
unconditionally to supported scalars through the existing class/style
lowering. Known nested Text can own a partial static frame. Any authored
inline style, spread, children prop, dynamic class, residual style, forwarded
owner or unassessed protocol feature prevents this first optimization.
Finally, ordinary lowering must produce only RN Text, with no generated
adapter, hook prelude or backend diagnostic. Only then is that exact ordinary
JSX/StyleSheet output returned. The same module can contain an optimized
root and an unrelated runtime root; this is not an import-wide substitution.
Missing proof selects the unchanged runtime helper, not an authoring error
or an invented platform default. The existing experiment's unsupported-root
diagnostics remain identical, including for otherwise inert animation or
transition declarations.

The compiler/Metro mock-host tests execute the actual shipped leaves with
separately compiled labels. A complete two-Text memo label has two inherited
Text helpers on the runtime route and zero on the static route, while its
two dynamic View owners remain. Ancestor/label updates preserve mock host
identity, refs and label state. The static nested Text keeps only its own
declared props and delegates seven-field inheritance to RN; the mock does
not pretend to render that inheritance. Its separately labelled attribute
projection agrees with the runtime effective frame. The open opaque/memo
case also runs with static selection and must keep its runtime propagation,
override/removal and grouping behavior.

These are output/helper-count and React/mock-host observations, not a new
Native pixel or elapsed-time result. RN's own TextAncestorContext remains.
The reviewed four-panel device fixture is intentionally unchanged and still
uses the runtime-only production selection. A new production static-path
device comparison, broader integration and physical-device performance
review remain before any default rollout or ADR acceptance.

## Production static-path Native comparison preparation

Follow-up: [#1146](https://github.com/iray-tno/hozo/issues/1146). The isolated
story retains the four earlier controls and adds `production-static`, built
by the actual `{ textInheritance: true, textStatic: true }` compiler/Metro
call. Its factory takes no replacement Text. A hygienic alias of the real
RN namespace export retains the compiled plain Text binding without asking
ordinary Metro to lower the already-compiled factory a second time. The
generated module must remain byte-identical through that ordinary transform;
neither a skip pragma nor a compiler-policy change is used.

The preparation classifies the fifth result from actual emitted code: it
must be exactly the ordinary result or exactly the runtime-only production
result. Any third result fails preparation. Removing a required root field
must resume the runtime route. Manifest v3 keeps the runtime leaf graph and
adds explicit selection/proof input hashes and the per-case fifth output
hash/route. A source-bound run still pins the whole repository; these named
inputs are not a claim to enumerate every transitive compiler dependency.
Turbo's Native test inputs include the newly read Rust files.

Mock-host tests observe zero inherited Text helpers in the fifth static
panel and two when its runtime proof fails. Both production panels retain
their shipped View owners. The opaque wrapper receives no frame/style prop;
ancestor changes and local override/removal must propagate through its memo
bailout with unchanged label state/callback identities. The reference remains
independent. UI control text is compacted to fit five mode controls; target
Text styles and exact comparison thresholds are unchanged.

The shared image driver now requires **70 states / 121 comparisons / 84
acknowledged actions**, including 111 exact equalities and ten intended
ancestor changes. The fifth marker has a distinct orange color. A fifth-only
pixel, marker, remount or opaque inheritance/override failure must abort and
retain evidence even after all earlier panels passed. Offline review handles
v2 and v3 with their own fixed denominators, never counting a historical
four-panel run as new static-path evidence.

Preparation and synthetic rejection checks alone are not Native results.
The reviewed four-panel run remains historical; the v3 source required fresh
Android/iOS binaries and independent raw PNG/AX/archive review. Full/release
scenarios, ordinary lowering and the runtime-only control selection remain
unchanged. This does not assess physical-device performance or accept an ADR.

The [v3 static-selection report](measurements/native-text-inheritance-static.md)
now independently reviews 70 PNG/AX pairs per OS plus actual APK, Simulator
archive and archived JS-bundle provenance. Both OS samples have 121 expected
comparisons and 84 acknowledged actions. The first iOS attempt failed during
cold Simulator discovery; that failure is retained separately from the
successful identical-source iOS-only follow-up. The full Showcase run is not
substituted for isolated evidence. This completes the bounded two-platform
rendering gate, not typography/widget/portal integration, measured update
cost or permission to enable default inheritance/static selection. Next work
should integrate real owners rather than expand this same comparison again.

## Bounded semantic compiler integration

[#1207](https://github.com/iray-tno/hozo/issues/1207) tracks the remaining work
through ordinary builds and docs capture. The first compiler slice extends
the shipped opt-in from Text/View to Paragraph, Strong, static-level Heading,
Small, Sub, Sup, Mark and NoBreak. It is not integration of the uncompiled
`@hozo/typography` exports or acceptance of the broader typography inventory.

Semantic relative sizes select a separate generated leaf,
`HozoInheritedRelativeText`. It reads the existing numeric size bridge,
calculates the semantic default once, and delegates to `HozoInheritedText`
with own class/explicit styles after that default. Its descendants receive
the effective seven-field frame, including the new size. The plain inherited
Text leaf has no additional hook/import for this relative adapter. Existing
static proof requirements are unchanged: semantic roots without that proof
retain the contextual route rather than pretending they are closed static.

The compiler test exercises all eight admitted semantic primitives with and
without preflight. The runtime graph executes real compiler/Metro output and
shipped sources across Heading/Small/Strong and an opaque separately compiled
memoized Text behind a View. It compares the independent private reference,
runtime-only production selection and proof-selected production route over
ancestor changes, explicit overrides, explicit undefined fields and complete
removal of the overriding style object. Independent expectations check the
heading/Small ratios, bold semantics, nearest color, all seven leaf fields,
stable label state/host identity and unchanged Native View count. RN's style
array erasure by explicitly present undefined fields is distinguished from
removing the final style object; the latter restores the class/semantic
default. This is resolved RN-style precedence, not CSS inline-style parity.

The new positive compiler test fails on the preceding implementation because
Paragraph is rejected by the passive-only gate. Both the former refusals and
the continued refusals are tested. Conditional classes, CSS-relative metrics,
dynamic heading levels, font families/styles/variants, animated/interactive
owners and additional adapters remain explicit internal-experiment errors.
The tests do not assess native glyphs, physical-device performance, transitions,
portal destinations or arbitrary third-party text owners.

```sh
node --test --test-concurrency=1 packages/compiler/src/text-reference.test.ts packages/tailwind-conformance/src/text-inheritance-runtime.test.ts packages/tailwind-conformance/src/text-inheritance-concurrent.test.ts packages/tailwind-conformance/src/relative-text.test.ts
```

Ordinary compilation and normal Metro/Showcase/`ui-docs` capture still select
the old path. No new public project switch is added. Default rollout must
complete the remaining real owner/portal/transition and update-cost gates in
RFC 006; merging this compiler slice does not complete #1207 or authorize
an accepted ADR. Historical device results above remain pinned to their
original sources; regenerating the fixture's current source hashes is not
a new device result.

## Bounded label-owner compiler integration

The next internal slice admits non-animated Button/Pressable roots whose class
styles are unconditional and whose host styles are resolved records/arrays.
The compiler emits `HozoInheritedPressable`; ordinary output still selects its
unchanged existing host. Stateful class conditions, host style callbacks,
transitions, Link/navigation adapters and other widgets remain outside this
compiler slice. No default/bundler or normal docs-capture selection changes.

The adapter reuses the actual `HozoPressable` source without modifying its
event or animation implementation. It partitions resolved own text fields off
the Native View style and places a label scope inside that existing owner's
interaction Context. The label class callback runs there once per committed
scope render, with a disposable snapshot, followed by explicit owner styles.
The shared seven-field frame reaches participating opaque memo/View labels;
only direct raw scalar children are normalized, not arbitrary React children.
No second event machine, added Native box, animation driver or child cloning
is introduced. A callback-supplied RN press snapshot remains distinct from the
owner's committed interaction snapshot.

Compiler regression tests fail at the former Button gate and pass with the
new adapter; actual Metro-generated Button output is compared to the retained
private reference and proof-selected route through ancestor changes, own
overrides/removal, label state/host/ref identity, raw strings/zero, accessibility
props and original press callbacks. The independent reference still delegates
to the same existing event owner, not the new label adapter.

A separate source-backed test drives that owner, not an imitation state
machine. Three controls produce three existing owners/Native Pressable hosts
and zero animation timings. Hover/press changes resolve the first label once,
leave the sibling Text unchanged and do not lend state to the nested control.
Local effective colors shield all three stable Text children from an ancestor
paint update. A mutation regression ensures a label callback cannot alter the
shared interaction value; transition and style-callback refusals are tested
without invoking the refused callback. These helper-level state observations
do not enable compiler state-conditioned classes or prove OS event delivery.

Uncompiled typography, raw third-party/RN label hosts outside the protocol,
other widget scopes, CSS/Native form-state parity, interrupted transitions,
portals and native glyph/performance validation remain separate. The bounded
compiler/static controls and historical device measurements stay unchanged.

## Bounded state-conditioned labels

The subsequent internal compiler slice admits hover, active, focus and
focus-visible typography, and non-empty conjunctions of those conditions,
on Button/Pressable's own seven label fields. It uses the existing condition
codegen and event owner rather than interpreting CSS selectors again. Box
conditions, conditional View/Text decorations, ambient/relational/negated/form
conditions, style callbacks and transitions remain explicit refusals. The
static proof is unchanged; these stateful owners retain the contextual route.

The generated-module test drives ten stages through the actual owner callbacks:
rest, hover, pointer focus/press, release, hover exit, blur, keyboard focus,
child override, override removal and pointer modality. An opaque memoized Text
behind View receives the effective frame in the independent reference,
runtime-only and proof-selected modes. All seven fields are asserted, alongside
stable label state, host identity and an unchanged sibling. The first attempt
exposed a probe defect: the reference was wired to an unrelated interaction
Context and stayed idle. It now consumes the real owner's singleton, while its
inheritance model remains independent. The failing observation is not evidence
of a production inheritance defect.

A separate headless Chromium oracle executes Tailwind's generated CSS with
real pointer/keyboard events and no Hozo lowering. Its first nine corresponding
stages agree. The tenth deliberately records an existing modality boundary:
clicking an already keyboard-focused button retains Chromium's `:focus-visible`,
whereas the existing Native owner clears its explicit bit on pointer-down.
This slice changes neither event policy and makes no claim of complete CSS/OS
event parity. Both original failing probe logs are retained under local
`artifacts/text-inheritance`, separately from the corrected successful runs.

```sh
node --test --test-concurrency=1 --test-name-pattern='Tailwind browser oracle for stateful' examples/storybook-demo/scripts/caller-composition.test.mjs
```

These are source-backed mock-host and actual browser observations, not new
Android/iOS pixels or physical-device performance measurements. Ordinary
Metro builds and docs capture still use ordinary lowering. Other real widget
scopes, rendered portal destinations, interrupted transitions and update-cost
gates remain before default activation.

## Native portal lifecycle prerequisite

Exercising the actual registered Native portal before destination-inheritance
integration exposed a pre-existing registration feedback loop. Item writes
rerendered the provider, recreated its Context methods, and reran each Portal's
registration effects. A bounded host-render guard reproduced the loop on the
preceding source, without spinning indefinitely or relying on a timeout.

The provider now memoizes its methods independently of its item snapshot and
leaves the Map unchanged for identical writes or absent removals. Content
updates keep the existing key's position relative to unaffected siblings.
Public API, keyed fragments and the absolute host stay unchanged;
no typography capture, host boundary or public API is added. Source-backed tests
cover two items, stable child state/host identity on replacement, individual
removal, complete cleanup, inline disabled/no-provider cases and StrictMode
effect replay. This prerequisite fixes lifecycle behavior, not typography or
Native rendering/performance. Portal destination and widget integration remain
separate gates; normal builds/docs still do not select the inheritance route.

## Rendered portal destination integration

After the lifecycle prerequisite, actual compiler/Metro output and the actual
Native Portal/PortalProvider/PortalHost sources now run together with the shipped
inheritance leaves and the independent reference. Registered children are
rendered at the host and therefore consume its effective frame, not the opener's
React ancestry. The existing protocol already provides this behavior: there is
no portal-specific frame capture, replay, reset or new inheritance adapter.

The Native graph covers provider present/absent and enabled/disabled across
reference, runtime-only and proof-selected routes. Five stages assert the seven
fields, opaque memo/View propagation, relative Small's effective size bridge,
own overrides/removal, stable label state/host identity and the unchanged Native
box count. Opener updates must not leak into a registered label; host updates
must reach it. A directly rendered custom PortalHost reads its own compiled
ancestor, and nested providers use the nearest destination. Removing the inner
host's own color/size resumes outer-host inheritance, never opener capture.

A separate Chromium test bundles the actual Web Portal implementation with
React DOM. Custom-container and default-body portals inherit from the rendered
DOM target; disabled portals stay inline. It checks host/opener updates and own
override/removal, all seven computed fields, DOM/state identity and Small's
ratio (with Native integer rounding distinguished from CSS fractional metrics).
The fixture supplies explicit pixel line-height: React DOM's unitless numeric
line-height is not a resolved Native pixel value. Native without a provider
falls back inline, whereas Web has a default body destination; these are recorded
platform contracts, not identical no-provider routing.

```sh
node --test --test-concurrency=1 --test-name-pattern='real Web portal inherits' examples/storybook-demo/scripts/caller-composition.test.mjs
```

The raw-source cache guards cover both actual platform portal sources. These
tests do not move any normal-build/default switch or establish Native pixels,
screen-reader focus, physical-device performance, arbitrary context replay,
dynamic destination switching or equivalence for Modal/pattern popup defaults.
Those popup/widget boundaries, interrupted transitions and measured update cost
remain before default activation. Historical device evidence is unchanged.

## First real pattern label owner: standalone selectable Chip

The next compiler slice connects a standalone selectable Chip to the same
seven-field protocol. Chip's existing slot resolver, text/box split and actual
Pressable continue to own classes and events. At the label position only, an
internal compiler-supplied component (`HozoInheritedLabel`) consumes the already
resolved text style. It does not receive class strings or predicates and creates
no event owner or Native View. On this route scalars get one Native Text; arbitrary
elements are passed through unchanged below the frame, not cloned or wrapped
in an extra Text. An opaque participating Text behind memo/View can read it.

The component binding is a generated-code ABI, not a new authoring Provider,
registration or public setup switch. Ordinary Chip imports no inheritance
helper and the ordinary compiler output is unchanged. Its source adds a private
optional label binding and guard; it does not read Context or resolve classes
again when that binding is absent. The new contextual label itself still has
runtime costs, so this is not permission for default rollout.

The assessed compiler shape has an explicit `selected`, `defaultSelected` or
`onSelectedChange` prop, no spreads and no `onRemove`. Only the owner's hover,
active, focus and focus-visible text predicates/conjunctions are additionally
admitted. Non-selectable/composite rows, box/form-state predicates, transitions
and other widgets retain explicit internal refusals. A runtime guard catches
dynamic props that cease to have the assessed shape. These refusals do not
remove ordinary Chip support. Raw third-party/RN Text remains outside the
protocol; only participating descendants are certified by this test.

The source-backed generated graph compares the independent reference,
runtime-only and proof-selected modes through eleven ancestor/state/override
stages. It checks all seven fields, sibling isolation, effective local-color
shielding, stable host/label state, raw zero, unchanged two-control/two-View
counts, checked-state activation and one authored change callback. A separate
string-label control has identical slot-callback counts (2, 4, 6 cumulatively)
with and without inheritance, the same box style, one existing control and no
extra View/animation timing. A bundled ordinary Chip graph contains no inherited
helper/protocol module. The independent reference gains its own resolved-label
scope; it does not import the production label helper.

A before/after ordinary Chip microbundle (esbuild minified CJS, platform/package
peers external) is 4,722 → 4,904 bytes, gzip 1,995 → 2,087 bytes: +182/+92 for
the private binding and shape guard. This is a bounded source-graph observation,
not a Metro bundle budget or device/update-time measurement; zero resolver/host
growth does not mean zero additional JavaScript or contextual-render cost.

The generated ABI gains one leaf; package exports are regenerated, not edited
by hand, and no new production dependency is added. Fixture regeneration only
refreshes the shared reference and three Rust source hashes; historical cases,
generated comparison outputs and device expectations are unchanged. These are
mock-host/compiler observations, not new Android/iOS glyph, OS event/AT or
physical-device performance measurements. Normal builds/docs remain ordinary;
additional pattern/popup scopes, interrupted transitions and measured update
cost remain before default activation.

## Composite and passive Chip slot boundaries

The following internal compiler slice extends Chip to its other three shapes:
passive label, removable label and selectable/removable row. The existing row
resolver's already computed text split now supplies the row scope, while the
toggle label retains its own label position. The removal icon and passive label
keep their pre-existing Native Text hosts, using the existing inherited Text
leaf through a second private compiler binding. There is no new generated leaf,
dependency, class resolver, listener, control or Native box. Resolved row values
flow down to removal, not row predicates: removal's own focus/active typography
overrides inherited values without focusing or changing the main label. Its
existing hidden-icon accessibility props remain on the same Text host.

The compiler assesses both root and secondary class slots with one shared
scalar/condition predicate. Opaque secondary classes have two IR forms (a
passthrough prop or a mixed slot's fallback); both stay explicitly unassessed.
Font numeric variants also have both typed and keyword IR forms, so both are
excluded rather than silently treating one as seven-field inheritance evidence.
Spreads, unassessed fonts, transitions, relative CSS metrics and other condition
families retain ordinary lowering plus an internal refusal. These boundaries
are not new restrictions on ordinary Chip support.

Source-backed compiler/Metro graphs compare reference, runtime-only and
proof-selected modes through 14 removable-only and 16 selectable/removable
stages each. They assert all seven fields through opaque memo labels/icons,
ancestor changes, row/removal/child overrides and their removal, independent
focus, shared ancestor hover/press, checked-state and distinct activation,
disable-during-touch cleanup, stable hosts and the existing icon's AT props.
The passive shape separately covers opaque labels and inherited metric updates.
All four shapes have paired ordinary/contextual scalar controls asserting
identical resolver-call counts, host topology, box styles and zero normalization.
The independent reference uses its own Text/label implementation, not the
production inheritance leaf. The ordinary bundle still imports no protocol.

The same ordinary-path microbundle setup used above measures 4,904 → 5,039
minified bytes and 2,087 → 2,145 gzip bytes (+135/+58) for this increment.
Keeping resolver and host counts unchanged does not erase this code-size cost
or establish the contextual path's runtime cost.

These mock-host observations do not establish fresh Web computed-style parity,
Native glyph/AT results or physical-device update cost. No normal-build/docs
switch changes. Other widget/popup owners, interrupted transitions and measured
cost gates still remain before default activation; historical device evidence
has not been expanded by regenerating source hashes.

## Independent Web oracle for Chip typography owners

The next comparison bundles the actual Web Chip source with React DOM, and
generates CSS with Tailwind itself. It does not lower that source with Hozo or
import either inheritance algorithm. The bundled input graph must include the
actual pattern source. Chromium reads all seven computed fields in all four
Chip shapes through 36 stages (5 passive, 10 removable, 8 standalone toggle,
13 selectable/removable). Button font/color/spacing inheritance resets are
explicit fixture preflight assumptions, not browser defaults claimed as portable.

Real pointer hover/down/up and keyboard focus/Space demonstrate the same slot
ownership required by the Native graph: removal focus does not focus the row or
main label; removal hover/press can activate its ancestor's typography; removal
owns its focus color and active weight. In a standalone toggle, focus styles
belong to the root button instead. The actual DOM permits only one focused
button at a time, unlike deliberately independent mock-owner state probes; this
comparison does not replay simultaneous focus on two buttons as an OS contract.

Ancestor metric updates, resolved owner overrides and their removal, an opaque
memo icon's own override, retained DOM identity, the hidden icon wrapper,
control counts, selection and distinct removal callbacks are asserted. Inline
owner styles in this oracle are applied to the actual DOM owners: this does not
add or claim a new Web Chip `style` API. These bounded CSS observations agree
with the seven-field ownership/precedence expectations in the generated Native
tests; they are not full event-stream, accessibility-tree or pixel equivalence.

```sh
node --test --test-concurrency=1 --test-name-pattern='real Web Chip and Tailwind' examples/storybook-demo/scripts/caller-composition.test.mjs
```

The existing raw-source cache guard already covers `patterns/src/chip.tsx` and
the relevant behavior source, so no extra production dependency is needed.
Normal-build/docs routing, transition behavior and other widget/popup owners
are unchanged. Native glyph/AT and physical-device/update-cost gates remain;
neither this browser result nor the main rebase extends historical device data.

## Shared committed text-colour driver prerequisite

Before connecting animated label inheritance, the existing callback Text colour
driver is extracted as an internal Native hook. Its progress node/listener can
then belong to the label owner rather than being duplicated at each inherited
leaf. This prerequisite does not yet enable inherited transitions.

The old callback Text updated its range ref during render and only noticed
interaction-key changes. A changed colour prop without a new interaction left
the old interpolation on top of the new colour. The common driver now retargets
on either committed target or interaction changes; abandoned/Suspense renders
cannot replace its range. Retargeting stops the previous animation and starts
the next interpolation at the observed absolute progress position, without
resetting the previous live node to zero. It reuses the existing colour blending,
easing, delay and JavaScript Animated driver; opacity/transform drivers and the
event machine are unchanged.

One lazy progress node and one listener live for the motion owner's lifetime.
Sixty simulated progress notifications cause no React render, and unmount removes
the listener. Target updates do cause a bounded layout-effect/state pass before
starting the new range; this is not a claim of zero retarget/render cost. Ordinary
non-transition controls still allocate no animation nodes/listeners. Source-backed
tests cover prop retargeting, repeated interruption, unchanged target/state,
StrictMode and superseded Suspense targets, alongside the existing owner tests.
These are mocked scheduling/node observations, not new Native pixels or timing
results. The next layer must connect the inherited paint transport and compiler
gate, including local override shielding and late-joining descendants.

## First inherited colour-transition connection

The internal compiler route now admits an explicit `transition-[color]` on
Button/Pressable when the existing Native planner produces a colour-only
transition from its static base and interactive colour declarations. It reuses
that planner and the shared committed driver, not a second class/event resolver.
No spreads or carried/unscanned candidates are certified on this motion owner.
`transition-colors`, `transition-all`, background/border/opacity/transform motion,
ambient conditions and unplanned colour transitions still retain ordinary output
plus an explicit internal refusal. Ordinary compilation remains unchanged.

The existing paint channel carries an immutable envelope around an opaque live
Animated interpolation; its scalar `color` remains the committed target, not a
sample of the visible colour. The protocol still has no RN import or new Context.
Participating Text under this motion boundary uses Animated.Text with the same
shared interpolation. An explicit local colour masks it without changing the
animated host kind; removing that override rejoins current progress. Static
proofs still require a closed, complete own-field region before erasing readers.

One label owner allocates one lazy progress Value/listener. Opaque memo/View
labels, raw zero and late-joining labels share it; they do not start individual
timelines. Frame notifications update that value, not Context/React state.
Target/range changes still have bounded committed React passes, and consumers
that compute an effective override may still render when an outer target changes;
the stable masked paint prevents notifying their nested paint readers. This is
not a promise of zero retarget cost. Each animated Text also has the ordinary
Animated host/binding overhead, not measured by counting progress Values.

Generated runtime-only and proof-selected graphs assert intermediate reversal,
owner-prop target changes/removal, local overrides during retargeting, late joins,
stable hosts, one owner/control, unchanged metrics-reader notifications, cleanup,
and no paint-reader notification from 50 simulated frame ticks. A separate
non-motion control constructs zero Values, while the extra motion commit pass
does not resolve label classes again. Unsupported colour representations use
the same parser as interruption blending and explicitly refuse certification:
moving owner colours are limited to supported hex, transparent and serialized
blended RGBA, not arbitrary Native/platform/named colour values. Ordinary static
local colours are not required to become blendable merely to mask an outer
timeline. Transition presence
cannot change within this assessed owner, and inheriting another active motion
as the new owner's base remains explicitly unassessed.

The helper-graph microbundle, with engine/platform/React peers external, is
10,370 → 11,245 minified bytes; gzip 3,727 → 3,986 (+875/+259). This excludes the
engine protocol delta, and is neither a Metro budget nor a device speed result.
Normal Metro/docs routing stays ordinary. The fixture refresh changes source
hashes, not historical device scenarios or expected results; its non-motion host
mock gains only a component factory, not an animation/timing implementation.
Fresh Native motion pixels/AT, interrupted wall-clock behavior, update-cost
measurements and broader widget/popup/transition scope still gate default rollout.

## Class-owned inherited text and background transitions

The next internal slice admits `transition-colors` and explicit lists containing
`color, background-color` when the owner has a static base text colour and only
its own text/background paints change. The existing Native transition planner
still selects timing and flags. Conditional borders, decoration, gradients,
ambient predicates, `transition-all`, authored root `style`, spreads and carried
candidates retain ordinary output plus the internal refusal. A broad property
list does not certify unsupported changing paints merely because the text part
works. Colour-only explicit `transition-[color]` retains its earlier domain.

Compiler-owned box callbacks now pass through the inherited adapter to the same
HozoPressable/TransitionPressable owner used by ordinary lowering. Its existing
box driver runs before caller event callbacks, and Animated receives a resolved
style array rather than the callback it would drop. The label resolves through
its separate existing channel and shares the committed text-colour timeline;
box callbacks cannot publish typography or opaque/unblendable background colours.
Changing callback ownership or transition presence remains unassessed.

The background driver is reused, not upgraded here. In particular its prop-only
retargeting is not assessed, which is why authored root styles are excluded from
the broader compiler gate. Its existing 16-state probes, colour progress node,
unused opacity Value and render-time temporary Value allocations remain. The
moving background adds one retained progress listener to the shared label's one;
this is not a claim that the full motion tree has only two Animated nodes or no
React work. Non-motion tests still construct zero animation Values/listeners.

Source-backed generated graphs exercise runtime-only and proof-selected routes,
overlapping hover/press/focus, interrupted background ranges, unchanged-label
targets, event ordering, raw zero, opaque late-joining Text, retained hosts and
listener cleanup. Fifty simulated ticks of both progress nodes do not notify
paint Context readers. The common event owner/control and View counts do not
increase. Compiler tests check refusals and unchanged ordinary lowering. A
previously missed generated component-name check now recognizes the inherited
owner when emitting the existing pressed-style callback; no diagnostic is merely
suppressed.

Against main `e8fe5064`, the inherited-helper microbundle grows from 11,245 to
11,988 minified bytes, gzip 3,986 to 4,147 (+743/+161), with engine/platform/React
peers external. This is not Metro size, a Native pixel result or a wall-clock
performance measurement. Normal Metro/docs routing and the closed Text-only
static proof remain unchanged. Regenerated device-fixture hashes describe the
new source, not new device motion scenarios or evidence. Native motion pixels,
AT, update-cost and physical-device gates remain before default rollout.

## Independent browser oracle for shared colour motion

The browser comparison now renders both real Tailwind CSS and the ordinary
compiler's Web CSS, separately, for the same text/background class list. Real
pointer hover/down/up and keyboard Tab cover six settled stages per sheet.
CSS-created colour and background transitions are paused at a controlled midpoint
(100,000ms duration, 20ms delay, linear; no wall-clock wait for completion).
Both sheets produce red text at `rgb(128, 0, 0)` and gray background at
`rgb(128, 128, 128)` at halfway. Nested and newly inserted Text inherit the owner's
live colour; a local colour masks it and removal rejoins it without replacing
the existing DOM node. An outside sibling remains unchanged.

The ordinary Native compiler's actual box callback is evaluated at the browser's
observed state, not a reimplementation of its priority rules. It agrees with the
compiled Hozo Web target at each settled stage. This found a **pre-existing
Tailwind compatibility gap**, tracked in [#1230](https://github.com/iray-tno/hozo/issues/1230):
with hover/pressed/focus active together, raw Tailwind chooses blue (active), while
both compiled Hozo Web and Native choose green (later authored focus). The test
keeps that discrepancy explicit rather than recording full Tailwind equivalence.
Fixing only the inherited Native helper would create a new platform difference;
shared class-origin ordering must also preserve StyleX and caller/state tiers.

```sh
node --test --test-concurrency=1 --test-name-pattern='shared text and background motion targets' examples/storybook-demo/scripts/caller-composition.test.mjs
```

This is browser inheritance/target evidence, not Native motion pixels, an AT
result, wall-clock synchronization, all colour-space parity or a claim that
reversal timing matches. No normal compiler/Metro routing or Native expectations
are changed by this measurement.
