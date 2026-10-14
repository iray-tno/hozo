# Runtime Native class list measurement

Issue #899 asks about the rendering cost introduced by #888, not just how
quickly a resolver function returns. The `runtime-class-list` workflow runs
the same driver serially against three source revisions:

- Before #888: `cc1914bf49aaddd642d850bed77cb503e3e9966d`.
- Immediately after #888: `6333a72ba5720fc3b25f4eeab0bbd66b5bf131b4`.
- The selected workflow ref (or the PR head for changes to this measurement).

Run it from GitHub Actions → **runtime-class-list** → **Run workflow**.
Download `runtime-class-list-evidence` or read the job summary. The artifact
retains build/run logs, raw samples, environment, source/driver commits,
addon SHA-256, the authored fixture, Metro output, generated candidate map
and diagnostics. Failed runs also upload their available evidence.

When evaluating an optimization, optionally provide a **post-#888 baseline**
ref in the workflow's `baseline` input. It is rebuilt and measured as a fourth
revision on the same runner, with the same driver/dependencies/settings. The
comparison validates its resolved commit and reports current/baseline ratios.
Do not attribute speed changes by comparing wall-clock numbers from different
runners. Leave this input empty for the original three-revision series.

The driver uses one fixed dependency installation across revisions and
rebuilds each revision's addon before starting a fresh measurement process.
It reads the revision's own export map, compiler, Metro transformer, class
resolver and Native component sources, not the installed released Hozo.
This isolates source changes from dependency upgrades and avoids reusing an
already-loaded addon from a different revision.

The workflow retains third-party Rust build caches but cleans all Hozo
compiler crate artifacts before each revision. Separate checkouts have the
same package IDs and source mtimes older than the first build: sharing a
target directory alone can make Cargo reuse the first binary incorrectly.
The comparison also rejects identical before/after addon hashes. Cleaning
and rebuilding occur before timing, not inside the measured work.

## What it measures

Each row is compiled through the actual Metro source transformer. It
contains a runtime-class Pressable and a Text child. Cases are 32, 256 and
1,024 rows, both plain classes and classes including `active:opacity-50`.
After two untimed warmups, nine samples retain:

- Mount of the complete list.
- A parent update that re-renders every row and changes its text.
- Pressing one row, checked not to re-render its idle siblings.

The simulated RN Pressable executes style callbacks instead of merely
retaining their shape. Counts assert that the requested rows actually
rendered; style checks assert base padding/colour and pressed opacity.
Candidate maps are warm and shared across trials. Compilation, bundling,
assertions, host lookups and unmount are outside timers. Scene construction
and React synchronous render/commit/effects inside `act` are timed. Known renderer deprecation messages
and Hozo diagnostics are retained without timing console I/O; unexpected
render errors fail the run.

The report validates all three revisions, matching environment/settings,
complete cases/sample counts and medians against raw evidence. It reports
median/p90/raw samples rather than a runner-clock regression threshold.

## What the numbers do not mean

Before #888 **does not support state classes**. Its warning and absence of
pressed opacity are retained, while the later revisions must apply opacity
0.5. The state-class cases are therefore not equal-feature speed comparisons.
The plain cases isolate the overhead paid even by lists without state
classes; the after-#888/current comparison includes later source changes.

This is development React test-renderer with simulated Native hosts. It is
not Hermes/production React, RN layout, bridge traffic, GPU, pixels, FPS or
physical-device evidence. A single runner and a small sample cannot prove
general performance. Nothing here changes conformance headline counts.

For a tiny local driver smoke check only (after building that checkout's
addon), run:

```sh
node scripts/runtime-class-list.mjs --rows 4 --samples 2 --warmups 1 --output artifacts/runtime-class-list/smoke.json
```

Full historical measurements belong in the dedicated CI job. Unit tests
in `scripts/runtime-class-list.test.mjs` validate options, sample summaries
and rejection of incomplete/mismatched evidence; their synthetic series
is not a timing result. No wall-clock benchmark runs in the ordinary PR gate.
