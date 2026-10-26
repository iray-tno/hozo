# Moving the common scalar plan through actual static lowering

Base: main `42ee5603af941d252492744abefbcfb774eb9848`, after #1324.
CPU1/Idle, serial, Node25 and Rust debug builds. This is the compiler-core
ordering operation, **not an installed adapter/default winner switch**.

## The ordered object is now the actual IR

`TailwindWritePlan::order_scalars` moves declarations in their original Vec
allocation, preserving stable ties and each declaration's source/guard/value.
It uses the same context-owned rule-priority index as candidate generation.
It never sorts authored expressions or invents a priority for a missing rule.
Empty/single-write regions do not allocate ordering scratch. Reordered regions
use rank/index and permutation scratch rather than cloning declaration payloads.

Eligibility is one assessed, non-important rule and a physical scalar property.
The rule's assessed owner predicates must equal the actual IR guard, including
conjunction multiplicity. JS expression guards, unknown media/selector shapes,
missing identity/descriptors, logical sides, gaps, registers and compound text
remain barriers for their whole contiguous input. Adjacent frontend input
boundaries and StyleX are not merged into one sort. This is not a value/theme
equivalence proof for arbitrary CSS plugins or a completed multi-rule planner.

The scalar-property boundary is shared with Native candidate metadata, not a
second family-specific priority comparator. The initial implementation repeated
rule assessment for each expanded side. The final implementation reuses the
cached assessed owner signature and checks the unique owning CSS declaration
without per-write selector/property-vector allocation. The initial slower probe
is retained, not discarded as an inconvenient result.

A `TailwindOrdered` source marker stops downstream condition grouping from
merging a later equal guard backwards across another guard. Adjacent equal
guards can still coalesce; existing unmarked/StyleX behavior is retained. The
source marker is compiler-only: `StyleSource` remains **12 bytes**, and
`StyleDeclaration` **200 bytes** on this host. Cached rule assessment now also
retains five u16 predicate counts; no zero-memory-cost claim follows from the
unchanged declaration size. Rust consumers exhaustively matching StyleSource
must handle its new variant.

`order_module_tailwind` uses the existing single IR walk for roots, children,
secondary slots, nested prop/verbatim nodes and forwarded declarations. It
does not reparse modules or install another JS compile option/global setter.
Ordinary `plan_module_tailwind` remains pass-through until final namespaces and
the static/fallback switch can be installed together.

## Evidence, not a report-only comparator

Rust workspace: **1,066 passed**, eight new correctness tests; one explicit
ignored timing probe was also run separately. Fmt, fresh addon and all-target
warnings-denied Clippy passed. Tests cover stable nontrivial permutations,
allocation preservation, idempotence, guard mismatch/multiplicity, importance,
unknown-input barriers, StyleX/nonadjacent input boundaries, late equal guards,
real secondary/nested IR, captured expression preservation and source layout.
The actual retained Web and Native emitter test checks both class orders and
retains the ordinary wrong-winner control.

The browser test invokes the current Rust `tailwind-scalar-plan` example driver
and executes its actual Native JSX/style objects. It does not read a committed
output snapshot or substitute a JS implementation of the plan. Real Tailwind
compiles the installed upstream theme independently. Across four fixtures in
both class orders and four real states, **32 Web comparisons pass**, including
padding, background color and width. **24 Native numeric padding/width selection
comparisons pass** against those browser results. Native color-space/pixels are
not certified by this projection. The same oracle detects old static winners.
The preceding rule-facts and generated-template oracles still pass 16 cases.

Compiler **354 passed +one existing Windows privilege skip**, engine **80**,
Tailwind **120**, generated fixture/cache guards **16**, focused browser tests
**3** passed. The Native fixture refresh changes seven existing source hashes
only, not its generated component bodies/text ABI. Storybook's Turbo task now
hashes the Rust example and the complete local Rust source/manifests it builds;
the source-input guard covers this new probe.

The first emitter fixture included `focus:bg-red-500`, absent from the exact
90-candidate portable bootstrap. The planner correctly refused that complete
input; it did not partially reorder it. The positive fixture now uses collected
classes, with dedicated missing-candidate negative controls retained. An early
exhaustive-match compile error for unsupported Context/AtRoot shapes was fixed
by explicitly refusing them, not by accepting their contents. Logs are retained.

## Cost and limits

The explicit ignored Rust probe alternates pass-through and ordering over nine
samples, 200 iterations each. Both include cloning the same prebuilt synthetic
IR; this isolates the additional planner rather than comparing parsing or a
release/debug mismatch. Three final process medians, microseconds per plan:

| Declarations | Pass-through medians | Ordered medians |
| --- | --- | --- |
| 1 | .164 / .174 / .164 | .194 / .203 / .197 |
| 16 | .751 / .797 / .739 | 9.585 / 9.193 / 9.091 |
| 128 | 5.392 / 5.825 / 5.232 | 65.374 / 66.143 / 65.183 |

The first, uncached-assessment probe had ordered medians about **21.05us** for
16 and **160.27us** for 128 declarations. The final operation still adds about
**8.4–8.8us** at 16 and **60us** at 128 in this synthetic debug fixture. That
plainly exceeds the relative 5% review threshold; it is build-time work needing
representative cumulative-cost review before default adoption, not a free
optimization or a device-render cost. Full raw samples, including first-use
context effects and earlier slower measurements, remain under
`artifacts/tailwind-order/static-plan/`.

The ordinary-output probe saves the previously built addon (Rust/compiler tree
identical to this main base), then compares it with the freshly rebuilt addon
under the same toolchain/debug profile. Initial three before/after process sets
are retained. Three further pairs alternate process order, separately with no
context and a prepared project context. Each measures one-class, owner-state
and mixed/captured-input modules on both backends, nine samples x200 calls.
All returned-output SHA256 values match across the probes. Final per-process
median changes range **-11.7% to +6.5%** without context and **-4.3% to +4.9%**
with context. The single +6.5% observation and negative swings are retained;
this small noisy workload does not establish a universal speedup or zero cost.
It tests unchanged default output, not the new planner's full-module cost.

There is no new device order helper/subscription/parser in this layer. No full
local root/pack/app/Metro/GPU build, new Native pixel/AT/Hermes result, heap or
production bundle improvement, coverage percentage or completed #1230 claim.
Next: publish compatible final static/fallback namespaces, integrate both paths
in one bounded slice, then expand important/multi-rule/platform semantics.
