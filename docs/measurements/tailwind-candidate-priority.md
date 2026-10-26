# Candidate generation shares static write-priority evidence

Stacked on #1308 (`3e203a691eff8b8a94045b8d1d6ccd95019da723`). This is the
build-time fallback metadata step of RFC007/#1230, not enabled application
winners or a new experimental device mode.

## One source of write evidence

Static Web/Native plans and actual candidate generation now call the same IR
`write_evidence` method. It combines existing strict original-rule ownership
with the cached importance/specificity/emission priority. Static plan field
names and behavior are retained, rather than adding a second implementation
of the same policy. There is no extra module inspection parse.

The internal `renderNativeModulePlan(context, theme?)` produces unchanged
generated `code` plus a schema-1 **build-time** sidecar. The native generator
resolves each candidate once; capture observes that real pass, not a later
reconstructed candidate list. A complete immutable context is checked before
generation. Missing candidates fail the call, not silently acquire a rank.

Entries identify `styles[candidate]`, `states[candidate][groupIndex][1]`, or a
refused/non-emitted candidate. State keys are copied from actual generated
predicate groups. Write indices name original IR properties before RN key
expansion, deduplication, synthetic keys and transform composition. They are
**not** indices into flattened RN object keys. A group gets a whole-object
priority fact only if all its writes have the same assessed rule priority.
Distinct or ambiguous rules, unmapped properties and unknown selectors retain
absent ranks and reasons. No first-rule/max-rank shortcut is introduced.

The ordinary API does not allocate a sidecar or query priority metadata.
No adapter installs this data on device, no engine arguments change and no
state/cache-hit sorting is added. This sidecar is deliberately descriptive,
not the eventual compact runtime ABI. Condition/value compatibility, input
tiers, final static/fallback namespaces and platform normalization remain
separate obligations before using any ordinal to change output.

## Verification

Windows, CPU 1, Idle priority, explicit serial execution:

- Rust workspace **1,051 passed** (three new Native candidate tests), fmt and
  all-target Clippy with warnings denied passed. Fresh addon rebuilt after
  final Rust edits; compiler/Tailwind builds passed.
- Compiler **348 passed + 1 existing Windows privilege skip**. Its platform
  smoke selection (**61 passed**) calls the new real-addon method, checks
  schema/fingerprint and compares actual generated code.
- Tailwind: **117 passed** (four new tests). They compare fallback write evidence with actual static Web and
  Native plans for every generated fixture object. They execute the emitted
  maps with a resolver-argument capture, not a replacement resolver presented
  as proof of device merging. Extra inspection parsing is forbidden.
- Duplicate custom utilities test ambiguous ownership; a synthetic four-rule
  Rust descriptor control has four individually assessed priorities but no
  whole-object rank. This is a defensive control, not an upstream custom-CSS
  compatibility claim. Direction/transform/unassessed writes retain reasons.
- Missing-context, empty-map and JS-copy isolation controls pass. Native
  fixture **5 passed**, cache guards **11 passed**. Regeneration changes only
  existing source hashes, not fixture bodies, ABI choices or source counts.
- Vite **57 passed**. The prior targeted browser oracle passes its eight
  independent upstream computed-color comparisons again. This is still a
  priority-facts oracle, not a new static/fallback winner acceptance test.
- Lint: **1,707 files**; docs: **76 primitives**, repository layout and **24
  package README footers** passed. No generated component bodies changed.

Generated-code and sidecar sizes are measured separately, without gzip:

| Spacing candidates | Ordinary module bytes | Build-time sidecar JSON bytes | Additional device bytes |
| --- | ---: | ---: | ---: |
| 0 | 258 | 106 | 0 |
| 1 | 356 | 638 | 0 |
| 256 | 27,722 | 140,977 | 0 |

The test asserts byte-for-byte equality with ordinary generation. The large
descriptive sidecar must **not** become a project-sized device table by
accident. These figures are not application bundle or performance results.
The eventual compact participating-conflict encoding still needs measurement.

## A real remaining gap found by the comparison

The initial test expected `p-2!` in the candidate scan and failed. A separate
probe confirmed: `p-2` is scanned and lowers to 8px padding on Web/Native;
`p-2!` contributes no candidate. Static Web leaves the class without padding
CSS, while Native emits neither padding nor a diagnostic. This predates this
sidecar. Upstream descriptors and their priority metadata do recognize the
important rule, which does **not** make Hozo's actual lowering support it.

The failing comparison and direct probe are retained under
`artifacts/tailwind-order/candidate-priority`. Working object-parity tests
cover emitted candidates, not this missing candidate disguised as a success.
Important syntax extraction/value lowering must be repaired and tested across
all paths before claiming an important-aware production slice. #1230 remains
open for that and the existing owner-state winner mismatch.

## Remaining scope

No static Web/Native or fallback winner switch, default adapter adoption,
runtime sidecar consumption, full local root JS/pack/app/Metro/GPU build,
fresh Native pixels/AT, new conformance percentage or speed/heap improvement
is claimed. Full integration remains CI's job. Next align the generated
compact fallback contract with the actual static write plan/final namespace,
repair the discovered important-syntax gap, then switch a complete shared
domain rather than introducing Native-only behavior.
