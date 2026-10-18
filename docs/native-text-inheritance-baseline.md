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
below is still not a complete reference implementation; optimized C and a
browser-computed-style oracle do not exist yet. There is no evidence
justifying default rollout. RFC 006's correctness, timing and physical-device
acceptance requirements remain unchanged.

## Experimental Context reference (test wiring only)

Tracking: [#1076](https://github.com/iray-tno/hozo/issues/1076).
`text-inheritance-reference.ts` lives in the private conformance package.
It is not exported by engine/primitives, selected by the compiler, or used
by any application. Normal compilation and runtime imports are unchanged.
The driver explicitly substitutes generic Text/View and the generated
Pressable leaf only when running `--mode reference`:

```sh
node scripts/text-inheritance-baseline.mjs --rows 32 --output artifacts/text-inheritance/control.json
node scripts/text-inheritance-baseline.mjs --rows 32 --mode reference --baseline artifacts/text-inheritance/control.json --output artifacts/text-inheritance/reference.json
```

Re-capture both records with this same driver. These records use schema 2;
earlier schema-1 artifacts have a different driver/fixture hash and must not
be silently compared to the new two-workload records. Baseline remains the
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
