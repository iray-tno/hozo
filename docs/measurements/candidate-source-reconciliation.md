# Runtime candidate source-fact reconciliation

Based on main `5df4a376fc7b9c24f67301b927f0c643db4e5cd5`. Parent #1287
merged with all ordinary CI40273243472 checks and the real sequential
Turbopack/webpack integration40273243549 successful. This is the first common
data boundary for final source reconciliation, **not** a claim that all build
graphs or final ordering contexts have been reconciled.

## Contract

The native cache now exposes a borrowed per-file entry. The Node boundary
exports an opaque string containing transport schema, native scan version,
trusted-source policy, runtime candidate names and the `usesTailwind` fact.
Mtime is intentionally excluded: equal source/worker observations must not
conflict merely because their bookkeeping timestamps differ. There are no
theme values, resolved style objects, parser/IR handles or source code in it.
The record is separate from persisted cache bookkeeping.

While validating this contract, a deterministic regression demonstrated that
the existing persistent cache did not record which trusted-source policy had
produced its facts. Reopening under changed `sources` accepted unchanged mtimes
and could then export old facts labeled with the new policy. The red observation
is retained in `reconcile-policy-red.log`: `isCurrent` returned true where the
new policy required recollection. This was not a speculative flaw or a flake.

Cache construction now establishes a persisted opaque source-policy identity
before any file entry can be accepted. A changed policy clears file facts,
class reference counts and Tailwind-use answers; the same policy keeps warm
entries. Internal snapshot version **5** rejects version-4 data, which had no
policy provenance. The quoted-array migration regression still verifies its
historical version-3 input is rescanned, now into format 5. Names/meaning of
supported utilities are unchanged. This constructor check, unlike the new
export/import methods, applies to existing default adapters immediately.

Import checks every field/schema and source policy before mutating the cache,
normalizes the name set, and records an adapter-supplied mtime. It never reads
or scans source. The existing scan/compile/default-adapter paths do not call
the new methods; no new utility winner or supported/refused domain is enabled.

`reconcileRuntimeCandidateContributions` belongs to compiler/project, not a
second scanner in each adapter. The caller supplies the authoritative input
set and validated revisions, including configured authored content **and**
active derived modules with their full environment/query IDs. It must not
drop an authored file merely because the bundler does not statically reach it:
the project-wide runtime candidate scan deliberately covers configured content.

The reconciler creates a new in-memory cache and adopts only matching input
revisions. Equal worker observations deduplicate; absent inputs contribute
nothing. Missing, stale-only, conflicting and invalid/incompatible observations
produce `incomplete` with per-ID reasons and **no partial cache** to accidentally
publish. Old observations cannot override a matching current receipt, and
iteration order does not choose a worker's answer. An empty authoritative set
is a complete empty runtime inventory. The caller's inputs are not mutated.

`complete` is explicitly scoped to **runtime scan facts for the declared set**.
A static-only Tailwind file has an empty candidate list and still carries
`usesTailwind=true`. Lexical/static/actual compiler units remain separate and
must join the final ordering namespace; runtime candidates are never falsely
treated as all static utilities. Revision matching is not authentication or
filesystem discovery: adapters must establish real producer/input identities.

## Local verification

All workloads use CPU1 / Idle, Rust jobs/threads1 and Node test concurrency1.

- Workspace Rust tests: **1,042 passed**. Rustfmt and all-target workspace
  Clippy with warnings denied passed. The new Rust test covers missing,
  replaced and forgotten per-file facts, including static-only Tailwind use.
- Fresh native addon and compiler package build passed before final JS checks.
- Compiler suite: **347 passed plus one existing skip**. Seven new JS tests
  replay records with native `scanFile` and `persist`
  forbidden, including JSON round trips and the common reconciler. Complete
  Web CSS and Native resolver modules are byte-identical to the original cache
  under both default and alternate themes. Timestamp-only updates preserve
  record equality; malformed/schema/policy failures do not partially modify a
  valid cache.
- The persistent-policy regression verifies both trust-change directions at
  the **same source mtime**, and a warm same-policy reopen preserves facts.
  Focused policy/replay/quoted-array migration tests: **9 passed**.
- Reconciliation tests cover deleted inputs, duplicate workers, shared class
  references, observation-order independence, missing/stale/conflicting/invalid
  observations, full query IDs, current-over-old revisions, empty graphs and
  same-named foreign versus trusted primitive policy.
- The host-addon replay smoke also runs through the existing macOS/Windows
  platform-smoke entry point. Local platform smoke: **60 passed**. Other OS
  results remain CI evidence, not locally measured results.
- Default-adapter regression suites after the persistent policy fix:
  Vite **39 passed**, Metro **89 passed**, Next **20 passed**. These are local
  unit/server-hook checks, not new real app-build or device results.
- Native text-fixture checks: **5 passed**. The normal generator changes
  **two source SHA-256 values only** (compiler API declarations and NAPI source),
  not fixture bodies or binding decisions. Source-cache/workflow guards:
  **11 passed**.
- Lint: **1,695 files passed**; generated docs/layout/footer checks passed
  (**76 primitives / 24 packages**); `git diff --check` passed.

An initial compiler suite invocation used the repository root rather than the
compiler package. Its dependency-resolution fixture correctly reported
`RN_COMPAT_NOT_INSTALLED` for the wrong relative test path. Running through the
package's normal working directory passes; no resolver behavior or assertion
was loosened. The failed invocation remains in
`artifacts/tailwind-order/reconcile-compiler-tests.log` along with the corrected
run and all other `reconcile-*` receipts.

## Limits and the next slice

No Vite/Next/Metro lifecycle consumes these records yet. In particular, this
does not fix cached derived-module replay, multi-writer candidate CSS/cache
races or deletions in an actual production build. It supplies the common
native facts/reconciliation operation needed to do so without another parser.

The next adapter slice must link records to the real transform cache and
authoritative graph, establish producer/input revision validity, and collect
all static/actual units before preparing one final context. The installed Vite
8 plugin types explicitly mark `shouldTransformCachedModule` as unsupported
by Rolldown; adding that no-op hook would not be evidence of cache replay.
Incomplete metadata must trigger recollection or an explicitly incomplete
result, never a guessed complete namespace or a false empty inventory.

Shared winners, broader portable signatures and the common comparator remain
disabled/incomplete in #1230. No local full-root/packing/application/Metro/GPU
build, new device pixels/AT or actual build-clock, addon-size/startup/peak-memory
claim. Replay serializes/copies source facts when explicitly requested; it is
not asserted zero-cost. Existing constructors compare the policy once per cache
open; old snapshots need one correct cold rescan. Per-file scanning and ordinary
lowering gain no additional analysis loop.
