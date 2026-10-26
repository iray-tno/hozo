# Default Next loader sessions

Based on main `6617eee1`, after #1282 merged. Its final ordinary CI
40237598183 and separate Android/iOS run 40237668518 were all successful before
this follow-up. This layer installs Next's actual loader default; no optional
experimental flag or new asynchronous config API is introduced.

## Boundary and lifecycle

`withHozo` remains synchronous, preserving both loader registrations and MDX
plugin nesting. Its existing source walk now also supplies an approximate
no-AST ordering seed, including static classes **without** growing runtime
candidate CSS. The config hashes that copied seed/options once; the loader
does not stringify the project-sized seed for every module.

In a loader worker, one bounded epoch owns captured project CSS, its matching
theme/compiler, StyleX registry and `TailwindProjectSession`. Actual full
`lowerModuleOrPrepare` runs after Canvas lowering and retains full metadata,
diagnostics, secondary slots and source continuation on a miss. A ready hit
uses its actual parse directly. Actual units absent from the scan expand the
worker-local universe. Concurrent expansion retries only the obsolete
namespace before delivery. No global order setter is installed.

The same captured CSS supplies candidate order and the primitive compiler.
The old provisional candidate write/fire-and-forget reorder is removed.
Candidate CSS is published after preparation for the final observed local
revision. Warm unchanged universes reuse the sorted order rather than sorting
the entire project again; unchanged candidate sets do not re-render the sheet.
Full resource/query IDs isolate source supersession and candidate-cache rows.

Existing CSS/import files and missing conventional discovery entries are
registered through the loader dependency API. On entry and before delivery,
file metadata is compared against the epoch stamp. CSS bytes/hashes are checked
at adoption, with the metadata stamp captured **before** validation so an
interleaved edit cannot give old bytes a new stamp. A changed dependency or
config retires the compiler/session together; even completed-but-not-delivered
old output cannot overwrite new module/candidate CSS. Epoch setup rejection is
not permanently memoized. Unassessed/broken CSS preserves warned legacy
lowering, never a fabricated default-palette canonical context.

This uses the common supported loader boundary, not a Turbopack plugin or
unsupported `target`/`mode`/`emitFile` APIs. See the primary
[Next loader API limits](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#missing-webpack-loader-features)
and [webpack dependency API](https://webpack.js.org/api/loaders/#thisadddependency).

## Local verification

CPU 1 / Idle; workloads and test files are serial, concurrency 1. No subagents,
root suite or local app/Metro/GPU build was used. The existing addon matches
the current main's unchanged Rust/compiler sources; no Rust changed here.

- Next package build passed. Next tests: **20 passed**, including **nine new
  actual-loader tests**. Complete lowered code/module CSS and runtime candidate
  CSS match independent ordinary lowering/class-order controls under a custom
  theme, including responsive candidate ordering, Canvas and secondary slots.
- Twenty modules have **one retained preparation and 19 ready attempts**, with
  ordinary compilation/global context installation prohibited. A newly parsed
  class becomes ready next call. This is a structural count, not a speedup or
  real-app clock claim.
- Imported CSS edits replace both compiler/session and both stylesheets without
  re-running config. Creating a higher-priority previously absent conventional
  entry changes the selected theme. Deferred tests reject old-epoch writes and
  retry a stale local namespace after a concurrent derived-source addition.
- Resource queries keep both pending requests and candidate rows separate.
  No-op sources, error policy and full-module diagnostics preserve ordinary
  behavior. Unassessed CSS is warned and has no preparation session.
- Source-cache/workflow guards: **11 passed**. Next's test task now builds its
  own helper, because the actual plain-JS loader imports `dist/tailwind-epoch.js`;
  a fresh checkout cannot rely on a previous local build. Turbo dry plans
  confirm the own-build edge, compiler/Tailwind dependency edges and inclusion
  of the loader plus new helper/test source inputs.
- Lint: **1,693 files passed**; generated docs/layout/README checks passed
  (**76 primitives / 24 package footers**). `git diff --check` passed.

The first added error test assumed malformed JSX with no trusted import would
be rejected. Ordinary lowering deliberately leaves that source to the bundler,
so the test now asserts pass-through and separately verifies the existing
`UNLOWERED_REACT_NATIVE_JSX` error policy. No production refusal was relaxed.
The first dry-plan reader tried to parse Turbo's stderr banner as JSON; the
unchanged captured output was parsed from its JSON boundary. Both observations
and corrected runs remain under `artifacts/tailwind-order/next-session-*`.

A narrowly path-filtered `next-integration` workflow runs the existing real
fixture's fresh **Turbopack then webpack** builds and output assertions, with
workspace build concurrency 2 and complete failure logs. It is not an ignored
whole-repository rerun or `continue-on-error`. The local run did not execute
those heavy builds; their CI result must be checked separately. Main's full
integration report remains unchanged.

## Costs and incomplete work

Startup adds a source read/byte scan for the lexical seed and a captured
stylesheet/theme plus bounded ready/last-pending ordering index per worker.
Warm loaders perform metadata checks on the watched stylesheet graph at entry
and before delivery. They do not re-read CSS bytes or re-sort an unchanged
project universe, but this is not a zero-overhead claim. No repeated tiny
benchmark, actual Next build clock, memory or production-size measurement was
run locally.

Capture is not an atomic filesystem transaction, and an edit during initial
capture can abort that compilation rather than publish mixed facts. Warm
metadata is not an adversarial content-integrity guarantee. The tests prove
loader registration and behavior on subsequent invocation, not real dev-server
watcher event delivery or HMR after every possible creation/deletion.

Worker-local source/candidate caches and final namespaces are **not globally
reconciled** across every worker or transformed-only source in a production
build. Cached derived-source replay and deletions still need that final-graph
work. No new cascade winner, device runtime, utility support or coverage
denominator is changed. Global reconciliation, broader portable signatures and
the shared comparator remain in #1230; this is not its completion. No fresh
device pixels/AT, full-root publishing/packing suite or WASM artifact claim.
