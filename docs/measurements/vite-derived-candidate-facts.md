# Vite query-module candidate observations

Stacked on #1294, source `b5c967a296f77e1db622cbfdfd84b36e6abda5b0`.
This extends the internal [final-graph inventory](vite-candidate-inventory.md),
not the active stylesheet publisher or shared cascade winners.

## Ownership

A query ID can refer to generated JavaScript or a different view of a physical
source. Its facts must not be inferred from the disk file, keyed by that file's
mtime, or written over the authored file's persisted native entry.

The build inventory now owns one lazily created in-memory native scratch scanner
under the same trusted-source policy. For each eligible query module it scans
the actual transform input, exports the opaque record, and forgets the scratch
entry in `finally`, synchronously before any await. Only the receipt survives.
No scanner/parser is reimplemented in JavaScript, no scanner is constructed per
query, and no scratch candidate union grows for the lifetime of the project.

Full query IDs remain distinct in metadata, including when they share a
physical path. The existing producer/input/final-output proof and source-policy
validation apply unchanged. An older input cannot be sealed after its
replacement has been observed. Missing or stripped receipts remain incomplete;
physical authored facts are never used as an excuse to accept them.

Dev mode does not create this inventory or scratch scanner. The change does not
add query candidates to active runtime CSS or erase existing candidates. The
final graph inventory still always says `finalOrderingReady: false`.

## Verification

Local Windows, CPU affinity 1, Idle priority, serial execution:

- Vite build passed; Vite tests passed **57/57**, **6 additional tests** over
  the 51-test inventory layer, plus the previous query test now verifying
  positive collection rather than the previously missing observation.
- Lint passed for 1,697 files; docs checks passed for 76 primitives,
  repository layout and 24 package README footers.
- Unit controls verify one reused native scratch instance with zero retained
  entries/no persistence, independent full IDs, removed graph observations,
  native static-class subtraction and Tailwind-use truth under default/custom
  source policies, and rejection of late older query observations.
- Small real Vite builds verify transformed query MDX rather than raw Markdown;
  two loaded query variants alongside their configured physical source; the
  physical cache's exact record and active CSS remaining unchanged by the
  derived facts; metadata loss staying incomplete; and changed transform input
  replacing facts while the physical file is unchanged.
- Existing source deletion, mid-build authored mutation, graph failure,
  downstream/OXC, dev, epoch cancellation and namespace-expansion tests remain.

No Rust/compiler source changes, utility coverage or winner changes are part of
this layer. The extra native scan applies only to observed eligible query inputs
in build mode; final reconciliation still replays records without scanning.
No throughput/heap/package-size claim, full local app/pack/root suite, pixels or
AT was measured. Heavy application verification remains CI work.

## Next boundary

Observing query facts is not publishing correct final CSS. Static/actual
compiler units still need to join one final ordering namespace with controlled
re-emission; real cached-transform reuse and multi-environment/SSR/watch
lifecycle still need evidence. Plugins generating new Hozo input after our pass
and virtual modules excluded by the current transform boundary are not made
supported by the scratch scanner. Next/Metro cross-worker publication remains
separate. There is no no-op cached-module hook standing in for these guarantees.
