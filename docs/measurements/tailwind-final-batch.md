# One bounded static/Native-candidate publication context

Built above #1327 (`ad129cbdf8957c01abcaadd82ee83f93f7d96c07`). This joins
actual retained modules and reconciled runtime scan facts before preparing a
single context and returning their real outputs. It is **not an adapter default
switch, complete worker-graph protocol or new canonical-winner claim**.

## Boundary and ownership

`emitFinalTailwindBatch` in `@hozo/compiler/project` takes an authoritative
finite module ID/revision list, collected one-shot compiler handles and the
existing opaque runtime-source contributions. It reuses native scan replay and
the established retained-module emission/disposal path. There is no second
scanner, parser, bundler resolver, shared disk-cache writer or global setter.

Static units come from the actual prepared parse, including resolved aliases.
They join the ordering context but are not added to runtime candidate membership.
Every accepted module and `renderNativeModulePlan` receive the **same native
context object**, not merely separately prepared contexts with similar ranks.
Their output fingerprint is checked. Zero-module/static-only/runtime-only batches
still prepare once and keep fallback membership exact.

Missing/stale/ambiguous current modules or incomplete runtime facts reject the
publication. Old/deleted handles are disposed without inspecting their units;
after validation they are released before async preparation, not retained through
the wait. Accepted handles transfer to one cleanup owner. Bad preparation,
incomplete context, a consumed handle, later module failure, cancellation and
candidate-render failure return no partial outputs or mutable publisher cache.
Non-cooperative late preparation is handled without delivering a late result.

IDs/revisions/theme and runtime facts are captured before awaiting. Mutating a
request afterwards does not change that captured batch. This is not a filesystem
transaction: the adapter must abort/replace the batch if its graph/epoch changes.
It also remains responsible for matching compiler/theme/source policy and for
checking ordinary compilation diagnostics. This API does not authenticate
revision tokens, infer theme equivalence, transport consumed IR across workers,
prove the caller supplied the entire graph or finalize Web candidate CSS.

The context-capturing wrapper calls the existing lifecycle helper. Its original
ordinary/session call sites and function bodies remain unchanged. This is a
new build-time API/export/module, not a claim of zero import/startup/package cost.
No new device ordering helper or subscription is installed.

## Evidence

Windows CPU1/Idle, serial, fresh parent addon (no Rust changes in this layer).
Compiler **358 passed +one existing Windows privilege skip**; Tailwind **127
passed**; fixture/cache guards **16**, Vite **57**, native-host checks **3** passed.
Mixed Web/Native and full-pipeline result types remain checked by TypeScript,
including a rejected Web-only assignment for a mixed batch.

Tests use real prepared Web/Native modules, actual Tailwind preparation and
opaque native scan records. Strict object-identity assertions cover the common
context. The candidate scanner and disk persistence are poisoned after initial
collection. The full post-Canvas `prepareLowerModule` output also passes through
this publication unchanged, not a copied primitive-only pipeline. Prototype
fault injection verifies candidate enumeration/render failures; gate-controlled
tests cover late cancellation, request mutation and one cleanup owner.

Two initial failures are retained. The type fixture caught inference collapsing
a mixed platform collection to its first entry; inference now uses the collection
array's module union, not `any`/unknown output. A failure-injection regression then
proved an ownership-transfer hole in the **new helper**: candidate enumeration
could throw after accepted handles had left the outer cleanup owner but before
entering the emitter. The test failed `0 !== 1` disposals. Fallible enumeration
now runs before transfer, and the same test passes. This was not an old released
behavior or a flake.

## Bounded cost, not a speedup comparison

The local `artifacts/tailwind-order/final-batch/cost.mjs` probe uses actual mixed
retained Web/Native modules, opaque runtime receipts and real precomputed Tailwind
snapshots. It excludes initial parsing and JS Tailwind preparation from batch
timing; native context decode, reconciliation, emissions and candidate-plan
generation are included. Nine samples x3 batches in each of three final fresh
Node25/debug processes, CPU1/Idle. Expected module/candidate counts, one prepare
call and common fingerprints are asserted. Median microseconds per batch:

| Modules / runtime candidates | Process 1 | Process 2 | Process 3 |
| --- | --- | --- | --- |
| 0 / 0 | 65.5 | 44.3 | 52.0 |
| 1 / 20 | 1,045.5 | 1,052.7 | 1,069.7 |
| 8 / 20 | 1,596.2 | 1,708.2 | 1,649.0 |
| 64 / 256 | 14,520.1 | 14,379.7 | 14,356.4 |

All samples and the earlier three processes are retained. The final empty-case
maximum was **4.143ms**, and the 1/20 maximum **2.673ms**; these are not discarded
in favor of medians. Final 64/256 ranges were **13.49–15.20ms**. Separate JS
Tailwind setup observations were **17.0–48.6ms**, not included in the table.

At 64/256, returned module JSON was **36,247 bytes**, ordinary Native candidate
code **27,722 bytes**, compact order JSON **3,388 bytes**. These are raw output
sizes, not a minified production bundle or heap reduction. The complete Native
sidecar is build-time data, not additional emitted application code. This is
total cost for a new bounded API, not an incremental regression/speedup benchmark
against a previously correct equivalent publisher or a project-wide budget.

## Next

Use the completed namespace at the coordinated static/fallback output boundary,
then connect authoritative adapter graphs and worker lifecycles before default
adoption. Important/multi-rule/platform barriers and cumulative build/runtime
cost review remain open in #1230. No full local root/pack/app/Metro/GPU workload,
fresh browser/device/AT/Hermes, heap/startup improvement, new conformance number
or project-wide final publication is certified here.
