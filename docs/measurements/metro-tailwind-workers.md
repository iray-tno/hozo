# Default Metro sessions use config-owned Tailwind CSS

Follow-up to #1275/#1280 on main `5b7acfa803a534bcaf14c66e7d43611c50859e5a`.
Both parent PRs were merged and their final ordinary/Android/iOS checks were
successful before this layer started. This installs the actual configured
Metro default, not another injected compiler test path.

## Ownership and output

Config captures the static CSS entry/import graph and serializes its bytes and
resolved import edges through `@hozo/tailwind`. Worker restoration checks schema
and installed Tailwind version, performs the same executable-CSS refusal, and
never resolves or reads project CSS. Each candidate universe still gets a fresh
Tailwind analysis state: arbitrary-variant order cannot depend on preparation
history. Serialization is lazy for adapters such as Vite that do not need IPC.

`withHozo` writes one content-addressed transfer plus its SHA-256 reference in
the atomically published `metro.json`. The transfer contains the full lexical
ordering seed, using the existing no-AST Rust scanner over discovered sources,
plus runtime candidates. Static names stay out of the runtime candidate map.
Generating that map uses the same captured theme. There is one config writer,
not one writer per Metro transformer subprocess.

The async default transformer restores one active epoch per root/platform and
uses `TailwindProjectSession` with the real post-Canvas Native transform.
Actual retained-module candidates expand incomplete startup seeds without an
ordinary reparse or a global context setter. Complete ready hits emit directly.
Helpers, full module metadata, StyleX/import decisions and diagnostics are
captured before waiting. Platforms own separate mutable compilers/StyleX caches.
Source supersession and config replacement reject late output, including code
already emitted but not delivered. A late old delivery cannot evict a newer
epoch. Malformed transfers/state fail, rather than mixing newly read CSS with
an older generated candidate module.

The startup cache key includes the captured CSS/seed/config epoch (preflight,
sources, helper discovery and font facts), in addition to the existing upstream
and dependency-manifest keys. Platform resolver facts have separate revisions;
resolving Android does not invalidate an in-flight iOS transform.

## Local verification

All commands use CPU 1 / Idle, one process workload at a time and test
concurrency 1. The current main-baseline addon was rebuilt first, then compiler,
Tailwind, Metro and Vite packages were built. A first Metro build detected the
old compiler declarations lacked the newly merged scanner export; the stale
addon/declarations were rebuilt before tests, not accepted as evidence.

- Metro: **89 passed** (six new worker/integration tests plus existing gates,
  preflight, class-helper and dependency-forwarding coverage).
- Tailwind: **106 passed** (three new transfer tests).
- Vite: **39 passed**, including real-server theme invalidation tests.
- Source-cache guards: **9 passed**; existing Native text-fixture checks:
  **5 passed**, with no generated fixture/body or source-hash change.
- Lint: **1,687 files passed**; generated docs/layout/footer checks passed
  (**76 primitives / 24 package footers**). `git diff --check` passed.
- The default Metro entry matches the full ordinary transformed string under
  the captured custom theme. A fresh child Node process restores and transforms
  successfully after the project CSS entry is deleted and imported CSS changed.
  Re-evaluating config adopts the new theme and changes the startup cache key;
  identical input/config preserves it.
- Twenty distinct source IDs have **one retained preparation and 19 ready
  attempts**, with ordinary module compilation/global context installation
  prohibited. New actual candidates absent from startup become ready on the
  next call without another retained parse.
- Concurrent iOS/Android transforms preserve their different resolver-verified
  StyleX values. Deferred tests reject superseded source/retired-epoch output.
- Transfers preserve theme/order receipts and full Web/Native compiler output
  across mutation/deletion, different preparation histories and cancellation;
  incompatible/corrupt/executable transfers are rejected.

The initial raw-TS test run rejected a TypeScript parameter property; it was
replaced with strip-only-compatible field initialization. Initial new padding
assertions expected a shorthand; ordinary output already uses four longhands.
Assertions were corrected to that existing contract, not production output.
These failures and the corrected runs remain under
`artifacts/tailwind-order/{transfer,metro-worker}-*`.

## Costs and remaining limits

There is an extra startup read/byte scan over discovered sources, a serialized
CSS graph on disk and one restored theme/session per active worker/platform.
Contexts remain bounded to one ready/last-pending index per session. A changed
source can add names to that worker's epoch-local seed; old names are harmless
descriptor false positives until restart, not extra runtime styles. A transformed
module also validates the config revision before delivery; an untouched module
does not incur that second state read. No repeated microbenchmark, actual-project
speedup, zero-overhead, memory or bundle-size claim is made.

CSS/helper/candidate-map changes still require Metro restart. Captured graph
acquisition is not an atomic filesystem transaction. Old content-addressed
transfer files remain on disk so older workers can finish against their own
bytes; no automatic cache pruning is installed. Broken/unassessed project CSS
retains the legacy warned path, not a fabricated ordering context.

The prepared planner is still pass-through: **no new cascade winner**, device
resolver, runtime subscription, coverage denominator or supported/refused utility
changes. Before common winners consume cross-module ranks, a production-wide
collect/reconcile step must fix the complete namespace across transformed-only
additions and worker processes. Next installation, that reconciliation, broader
portable signatures and the shared comparator remain open in #1230.

No local full-root/packing/application/Metro/GPU build, fresh device pixels/AT,
WASM size, startup or peak-memory measurement was run. Broader bundle/device
integration belongs to CI; a local unit pass is not device evidence. The iOS
character-alternative popup in #1279 is not claimed fixed by this work.
