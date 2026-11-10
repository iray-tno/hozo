# Built-in order for ordinary Native runtime maps

Continues #1230 / RFC 010 section 7C. The static default already uses built-in
Tailwind descriptors when no ordered project context exists. The ordinary
`CandidateCache.renderNativeModule()` still emitted positional resolver input,
so `p-4 p-2` selected 8px dynamically but 16px statically.

## Authority and retained boundaries

The ordinary Node binding now builds the same descriptor context and uses the
existing final candidate generator. Only compact ranks enter the generated
module, not descriptors, fingerprints, a utility parser or a second runtime
engine. Conflicting drawable classes use the resolver's existing cached ranked
template. An unranked drawable class keeps the **whole string** on its old path.
For example, `p-4 filter-none p-2` still selects 8px; `filter-none` is a supported
Tailwind 3 whole-declaration reset outside the ranked Tailwind 4 inventory.

Reporting-only contexts still report their supplied namespace's evidence, but
their code uses built-in order, matching static reporting. Their sidecar ranks
are not installed. This reporting call generates the supplied sidecar and then
the built-in output; it is not a one-generation performance claim. A completed
project context still uses its own ranks. The existing authored test context
keeps positional output as an executable negative control.

No owner admission, audit, text inheritance or adapter graph default changes.
The low-level positional renderer remains necessary for authored controls and
safe fallback if built-in context construction cannot represent the input.
Runtime state ranking and condition-weight group ordering are not deleted.

## Verification

With a fresh debug addon, Windows Node 25.9.0, one CPU / Idle / serial:

- `node --test --test-concurrency=1 src/*.test.ts` from `packages/compiler`:
  503 tests, 501 passed, two platform-conditional skips.
- The same command from `packages/tailwind`: 246 passed, no skips. This includes
  captured contexts, namespace expansion, project themes, build-time sidecars
  and the final publisher, not only the new context-free tests.
- `cargo test -p hozo_napi -- --test-threads=1`: 15 passed.
- Scoped Clippy with warnings denied and rustfmt passed. The Native device
  fixture was regenerated; only two compiler-source hashes changed.

The new `builtin-runtime-order.test.ts` executes emitted maps against the real
resolver, checks both class orders, overlapping focus/hover states, custom
spacing, static output, the drawable whole-string barrier and the authored
negative control. The existing transform regression now expects Tailwind's
reset winner in the ranked input and still verifies register restoration when
a drawable barrier selects authored order.

An initial barrier test used a Web-only arbitrary property: Native diagnosed
and omitted it, so it did not test a drawable barrier. It was replaced with
`filter-none`, not made to pretend that unsupported input is drawable. Existing
factory spies were updated for the already-supported object-form ABI.

## Bounded cost, not app or device performance

Comparing the generated default module with the existing authored control,
using `p-1` through `p-N` in one cache and Node `gzipSync`:

| Candidates | Positional bytes / gzip | Default bytes / gzip |
| --- | ---: | ---: |
| 0 | 297 / 186 | 297 / 186 |
| 1 | 395 / 234 | 395 / 234 |
| 256 | 27,761 / 3,409 | 31,691 / 4,725 |

Thirty warmed generation calls after five warm-ups averaged 0.036 / 0.049 /
7.18ms respectively on this restricted host, using the debug addon. These are
unbundled map bytes and build-time timings, not full application size, an
old/new latency comparison or a device frame-rate claim. Runtime engine source
is unchanged; the ranked data is not free. Full root/package and actual device
validation remain CI work, not locally claimed evidence.
