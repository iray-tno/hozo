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
rows. The bounded assertions also run in the existing conformance test task.
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

The first capture is baseline **A** only. There is no reference protocol B
or optimized implementation C yet, no browser-computed-style oracle in this
slice, and no evidence justifying default rollout. RFC 006's correctness,
timing and physical-device acceptance requirements remain unchanged.
