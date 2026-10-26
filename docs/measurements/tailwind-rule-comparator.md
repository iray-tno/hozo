# One shared Tailwind rule-emission index

Based on main `303671249c791d8841634cae2953db9d662a98b7`, after
#1292/#1294/#1296 merged with successful current-head CI. This is an executable
ordering primitive for the first shared slice, not another source inventory
and not yet a change to application cascade winners. #1230 remains open.

## Actual ordering contract

The IR context now provides one stable full-rule sequence, lazily indexed once
per immutable prepared context. The comparator follows the pinned upstream
[candidate compiler](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.3/packages/tailwindcss/src/compile.ts)
and [name tiebreak](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.3/packages/tailwindcss/src/utils/compare.ts):
arbitrary-width variant magnitude, the original ordered property signature,
descending declaration count and numeric-aware candidate name order. An ended
property prefix sorts after its extension, not before it as Rust vector order
would. Numeric name runs retain JavaScript Number rounding/overflow and string
fallback; non-ASCII ordering follows UTF-16 rather than UTF-8/scalar order.

The index uses borrowed descriptors and stable sorting. Identical keys of one
candidate keep upstream construction order. All rules of multi-rule candidates
survive; not-generated candidates contribute no rules and a missing rank is
never substituted with zero. No property-family table or expanded Native
property name enters comparison. The context validates descriptor structure
before comparison; its fingerprint remains provenance, not authentication of
an arbitrary hand-constructed snapshot.

The internal Node `PreparedTailwindContext.ruleOrder()` returns a fingerprint
and a copied sequence of `{candidateId, ruleId}`. Ordinal positions and IDs are
local to that context, never comparable across independently prepared universes.
Copy mutation cannot alter the native index. Consumers can share the prepared
index without reconstructing a JavaScript comparator or reparsing a module.
Existing compile/session calls do not request this lazy index yet. There is no
new public feature switch or alternate experimental output route.

Emission order is **not** the complete cascade: importance, selector
specificity, original-rule/write ownership, input tiers, predicates and
platform normalization still need to be applied by the shared write planner.
No ordering descriptor is automatically a claim that Hozo supports that rule.

## Measured

Local Windows with CPU affinity 1 and Idle priority; focused suites use explicit
serial execution. One initial host-smoke command used the package runner's
default file concurrency under that CPU affinity; it was repeated with explicit
`--test-concurrency=1` for the retained serial result.

- `cargo test --workspace -- --test-threads=1`: **1,045 passed**, including
  **3 new IR tests**. The portable descriptor corpus's first-rule sequence
  agrees with its recorded upstream ranks while retaining every rule. The
  native index is absent before the first query and reuses its allocation on
  later queries. Name controls cover zeros, fractions, rounded large numbers,
  overflow and supplementary/BMP character order.
- Workspace fmt and all-target Clippy with warnings denied passed. Fresh debug
  addon, compiler and Tailwind builds passed; no stale binary was used.
- Compiler suite: **348 passed, 1 existing Windows privilege skip**.
  Host platform-smoke selection: **61 passed**, including the new real-addon
  method test on the macOS/Windows CI path.
- Tailwind suite: **110 passed**, including **4 new comparator/oracle tests**.
  Expected positions come from the actual emitted upstream CSS, not a second
  implementation of our comparator. Controls cover builtin values, overlapping
  owner variants, numeric names, importance, and not-generated candidates.
- Duplicate custom utility definitions carry unique CSS declaration markers;
  their actual emitted positions verify all **10 rule instances**, including
  interleaving multiple rules of one candidate, prefix/count/name ties and
  stable equal-key order. Forging first-rule ranks to zero changes no result.
  Explicit numeric transport controls exercise variant bitsets beyond u128,
  empty contexts and JS copy isolation.
- Vite: **57 passed**. Native fixture: **5 passed**; normal regeneration changes
  only 3 source hashes and adds the comparator source receipt, not generated
  component bodies or text binding choices.
- Source-cache guards: **11 passed**. Both affected raw-source task dry plans
  contain the new comparator helper; their test inputs and fixture receipts
  were updated rather than relying on a stale parent-file hash.
- Lint: **1,705 files passed**. Docs: **76 primitives**, repository layout and
  **24 package README footers** passed.

The first oracle run incorrectly required a brace immediately after the root
class selector; upstream flattened state selectors, so it reported a missing
`active:p-2`. The measurement was repaired to recognize exact class boundaries
and gained a negative p-2/p-20 prefix control. The failing run is retained in
`oracle-tests.log`; no production selector support/refusal was relaxed.

## What verification has actually found

The source-policy cache bug repaired in #1292 was reproduced before its fix:
changed trusted `sources` incorrectly accepted unchanged file mtimes. See
[the recorded red observation](candidate-source-reconciliation.md). The original
#1230 owner-state mismatch was observed against real Tailwind/Chromium and
ordinary Native styles and still requires the shared output switch. These are
actual product defects, unlike injected malformed-receipt prevention tests or
the selector-reading error in this new oracle. Do not count every added test
as a previously observed application failure.

Adding the new helper to the fixture's tracked inputs also required updating
its explicit static-source count from 24 to 25. The first post-update fixture
check failed on that count; the corrected test additionally verifies the
helper's exact SHA256. Generated component bodies and binding decisions were
not changed, and the earlier failing log is retained.

## Next / not claimed

Use this common rule sequence in the assessed write planner and generated
candidate metadata under one final compatible namespace. Static Web, static
Native and fallback must change together for the selected domain. Final
static/actual-unit collection and publication, importance/specificity/unknown
barriers, portable domain expansion and cross-worker consistency are not
certified by rule sorting alone. No existing output order changes in this PR.

No full local root JS/pack/app/Metro/GPU build, fresh device pixels/AT or new
coverage percentage was measured; heavy integration remains CI work. No new
speed, heap or bundle-size improvement is claimed. This layer does not sort on
state updates or introduce a runtime helper, but lazy-index/cold/context and
payload costs still require measurement when integrated into actual output.
