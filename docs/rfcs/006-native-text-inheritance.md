# RFC 006: Native text inheritance with a measured static fast path

- **Status**: Draft; no compiler or runtime behavior changes in this RFC.
- **Authors**: codex-1
- **Target packages**: `@hozo/engine`, `@hozo/primitives`, `@hozo/typography`,
  `@hozo/patterns`, `@hozo/compiler`; Native compiler crates.

## 1. Decision proposed, not a performance claim

Make the Native inheritance contract independent of the compiler's ability
to understand an author's component implementation. Use a small runtime
protocol as the reference behavior, and erase it only where equivalence is
proved. Do not replace all static output with contextual components.

There is a real trade-off: a separately compiled, reusable Text cannot know
all its future ancestors. Correct inheritance through unknown callers can
require a consumer where today's output uses a plain RN Text. Both universal
fallback coverage and unchanged zero-cost output cannot be promised for that
case. Measure that cost before enabling the new path by default; do not
hide it by comparing only closed static trees.

This proposal adds no public styled factory, wrapper registration, special
`Button.Text`, required provider, or new variant/prop inheritance API. It
does not broaden unsupported selectors or replace the candidate resolver.

## 2. Current evidence and its limits

The source baseline inspected is main `a0693b188ae086dcd75256720ab78500be028127`.

- `crates/hozo_parser/src/text_forwarding.rs` summarizes recognized exported
  components. Unknown renderers/wrappers yield no summary; spreads or unknown
  variant values can prevent a caller from consuming a summary.
- `crates/hozo_native/src/text.rs` and `render.rs` forward declarations through
  visible nodes. Opaque View descendants can receive a warning instead of
  equivalent typography. RN Text-to-Text inheritance is not the same problem
  as inheritance across a View.
- `packages/primitives/src/pressable.native.tsx` forwards `hozoTextStyle` to
  strings and directly recognizable Text children, not arbitrary components
  rendering Text deeper inside. It also owns existing interaction/transition
  consumers; these must not gain a second event owner.
- `packages/engine/src/text-size.ts`, primitive text-size helpers and
  typography share a numeric size context for relative sizes. It is not a
  general inherited-style protocol.
- Native Portal re-renders registered children at its host; Web Portal uses
  `createPortal`. Neither an assumption about ordinary React ancestry nor a
  blanket reset to application defaults describes all portal targets.

These are code observations, not new device or performance measurements.
Existing forwarding tests remain valuable. They must not be deleted before
their behavior is covered by reference/optimized equivalence tests.

## 3. Supported semantics first

Start with the existing Native inherited-property set: `color`, `fontSize`,
`fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`, `textTransform`.
Inventory separately any additional forwarding done by pattern helpers;
keep its existing behavior, without claiming this seven-property set covers
all typography. Font family/style, direction, decoration propagation, CSS
keywords and arbitrary CSS inheritance need explicit classifications before
they join the new contract. Do not treat all RN TextStyle keys as inheritable.

For each supported property, the closest owner's own declaration overrides
the inherited value. At an owner, preserve existing class resolution,
conditions, semantic defaults and explicit-style precedence. An ancestor's
`!important` declaration does not outrank a descendant's own declaration
merely because the ancestor class was important. An absent value is not a
declaration of a platform default. Unsetting/removing a local override must
resume inheritance on the next render.

Preserve preflight-dependent heading/Small/Sub/Sup behavior and platform
accessibility font scaling. Publish logical RN units, not already-scaled
screen pixels. A relative size is calculated once at its semantic owner and
published as that owner's effective size; nested relative text compounds.

Relative line-height and em spacing cannot be reduced to a flattened RN
number too early. The plan must retain the distinction between inherited
computed lengths, inherited line-height multipliers, and declarations whose
used value depends on the child's size. Use browser-computed styles plus
independent expected values to settle these cases before porting them. The
new protocol must not perpetuate an old folding error for parity's sake.

The supported domain is Hozo-owned/compiled text and owner boundaries. A
normal function, memo/forwardRef wrapper, fragment or render callback needs
no registration; it can be opaque to static analysis and still render a
participating Text. Raw strings/numbers use existing safe text normalization.
Do not traverse component implementations at runtime or wrap arbitrary
children in RN Text: that changes layout and accessibility grouping.

A raw RN/third-party component outside compilation that never reads or
publishes the protocol remains an interoperability boundary. Native host
typography cannot generally be inspected through React context. Preserve
RN's own nested-Text inheritance; do not insert defaults that mask an unknown
native ancestor. Relative metrics below such an ancestor remain unassessed
unless supplied through an existing explicit style or a later explicit
adapter. Diagnose statically identifiable unsupported cases; do not promise
to detect every opaque implementation or label them all supported.

## 4. Internal architecture

### One protocol, two initial update channels

`@hozo/engine` owns the small platform-neutral protocol/types and context
identities. `@hozo/primitives` owns rendering helpers and Native style merging;
typography and patterns reuse them. Generated entry points go through the
existing generated-code ABI. Do not move rendering components into engine or
build a component-name registry at runtime.

The initial prototype separates:

- **Metrics**: effective font size/weight, line-height and letter-spacing
  descriptors, plus align/transform fields classified by the contract.
- **Paint**: effective color and its supported transition metadata.

This is a bounded split, not one provider per CSS property. A relative-size
consumer need not subscribe to paint. A generic text consuming both channels
still updates if either changes; reading one field from `useContext` is not
a selector. The prototype must record this remaining over-notification.

Preserve a singleton empty/inherit value and field-stable resolved records.
Merge outer effective values with local declarations, reusing the previous
record when its fields are equal. In particular, an overriding inner owner
can publish the same effective value after an outer change. `useMemo` is an
allocation optimization, not a semantic guarantee or a cure for actual value
changes. No mutable shared snapshots or global interning cache.

React compares context values using `Object.is`; changing a value updates its
consumers even through `memo`. Unrelated parent renders are a separate source
of work. See [React's context reference](https://react.dev/reference/react/useContext).

Keep the existing font-size context API during the prototype, but derive its
value from the same resolved metric result. Do not maintain two independently
calculated font sizes or make bidirectional context bridges. Removing the
old context is a later migration after its external/internal readers are
inventoried and update costs have been measured.

### Publish resolved styles, not a second style engine

Owners resolve class predicates through the current static/runtime slot
machinery. They publish their effective inheritable subset after current
style precedence has been applied. Consumers merge inherited data ahead of
their own existing declarations. Do not evaluate authored expressions twice,
move them into an event callback, or run a second candidate resolver.

Styled Text owners must publish their local override for opaque descendants
too. View-like owners pass through inherited fields and replace only the
fields they actually declare. Pattern label scopes are declared at their
actual internal owners, not around an entire widget including unrelated
controls, icons, inputs and popup content.

Inherited resolved color is data, not an inherited interaction predicate.
It must not make a decorative Text hoverable/focusable, grant unsupported
conditions, or let a nested control borrow an outer control's own events.
Keep the contracts in [style slots](style-slot-contracts.md) and
[Native pattern state styles](native-pattern-state-styles.md).

No new host Views/Text, native listeners, measurements or accessibility
elements. Helper/component identity and hook order remain stable as classes,
styles, children and state change. Do not mount/unmount a Provider around the
same children according to the current resolved value: it can reset child
state, selection and focus. Compiler-selected helper shapes are stable;
uncompiled helpers require an equally stable shape.

### No per-frame context traffic

Publish resting/target styles at semantic state changes, not every animation
sample. Reuse the existing event owner and animation infrastructure. Do not
resolve private Animated nodes via new private API reads.

This alone does **not** preserve animated inheritance: publishing only an
endpoint can make a descendant snap instead of transition. Prototype opaque
descendant color transitions against visible/direct-label controls, including
interruption. A shared driver or existing transition consumer may be needed.
Until this is proved, retain current animated paths and diagnostics; do not
enable the fallback by default for that case or claim full equivalence.

### Portal is a host boundary, not an incidental React ancestor

Typography follows the rendered destination's inheritance contract on Web.
Do not implicitly capture the opener's typography into an overlay. For
Native's registered portal children, derive context at the actual host; for
Web, keep CSS inheritance. A disabled/no-host Portal remains inline and
inherits inline. A custom host can itself have typography; do not reset it
to global defaults. Explicit styles inside the portal still win.

Cover Modal and pattern popup roots separately: they may have component
defaults. Preserve existing focus, a11y and lifecycle behavior. No portal
refactor or automatic cross-portal context replay is part of the first slice.

## 5. Compiler optimization requires proof

Use three internal classifications, with reasons available to tests/debug
output. They are not new author-facing modes.

| Plan | Evidence required | Output |
| --- | --- | --- |
| Closed static | Relevant inheritance, used metrics and consumers are fully known, with no opaque ancestor/child, style/spread or unknown runtime override | Existing direct RN Text/StyleSheet path; no new inheritance consumer/provider |
| Runtime boundary | A participating owner/consumer can depend on an unknown caller, opaque child or runtime style | Stable helper with the required publish/read channels |
| Outside protocol | An external native host owns values that neither compiler nor runtime can observe | Existing interoperability behavior and precise diagnostics where detectable; not a success claim |

The optimization unit is a property/channel and a proved region, not an
entire module. A literal class can still depend on dynamic ancestors or
state. Not finding a parser summary is not proof that inheritance is absent.
A reusable component with no own color/size cannot be classified closed just
because its own file contains no styled ancestor.

A statically folded descendant can eliminate a read only if the inherited
value cannot change through any reachable runtime ancestor. An owner can
eliminate a publish only if no reachable opaque child can consume it. Merely
having one known Text child is insufficient when other children are opaque.
Local style masking may remove some reads, but only after auditing the
transitive metric dependencies and descendants needing the published value.

Keep current parser summaries as optimization information, not the only
source of correct inheritance. Remove their correctness-critical uses in
small, tested steps. Keep static support broader than the candidate runtime
where it already is; this inheritance protocol does not require shrinking
the compiler to the runtime resolver's condition subset.

## 6. Correctness and performance acceptance

Build three versions from pinned inputs: **A**, current main; **B**, a simple
reference implementation retaining necessary runtime inheritance; **C**, the
optimized implementation. B/C agreement is necessary but not sufficient:
use independent property expectations and browser-computed styles so two
implementations cannot certify the same mistake. Do not compare the speed
of A's missing styles to B/C's correctly rendered output as equal work.

Correctness fixtures must cover:

- Same-file and cross-file/package Text, arbitrary wrappers, memo/forwardRef,
  render callbacks, fragments, maps, switch-selected components and spreads.
- Dynamic ancestor styles; style arrays/registered styles; removing overrides;
  semantic defaults, preflight, theme/breakpoint and nested relative sizes.
- All seven initial properties separately and together; intermediate Text
  overrides; mixed static/dynamic classes and single authored evaluation.
- Ordinary nested RN Text as a control, and explicit raw third-party
  boundaries with no false compatibility claim.
- Hover/press/focus/disabled typography with the existing owner machine;
  nested controls, decorative labels, and interrupted color transitions.
- Portal inline/hosted/custom-host cases, popup roots and Modal; no added
  a11y nodes, changed text grouping, remounts or focus/selection loss.
- Live ancestor changes after initial render; an optimization that matches
  only at mount is incorrect. StrictMode and abandoned/concurrent renders
  must not leak speculative style snapshots into committed consumers.

Performance fixtures separate closed static trees from required runtime
boundaries. Include 1,000 mounted labels (a deliberate stress fixture, not a
FlatList windowing recommendation), a genuinely windowed feed with measured
mounted count, 100 independent buttons, nested wrappers and overriding scopes.

| Update | Deterministic acceptance before timing |
| --- | --- |
| Unrelated parent state, stable children/props | No additional context-triggered Text executions; also test ordinary reconstructed children without attributing parent renders to context |
| One button's state | No inheritance-triggered updates in sibling buttons; unchanged effective style keeps the same published value |
| Color-only change | Size-only subscribers are not notified by the new paint channel; report generic Text subscribers separately |
| Outer change masked by inner overrides | Stable effective inner values; no additional notifications to shielded readers with stable props |
| Theme/size change | Affected readers update correctly; report count and cost rather than calling required updates a regression |
| Continuous transition | No per-frame Provider value updates; descendant animation remains equivalent |
| Child state/focus through style toggles | No extra mount/unmount or host creation |

Record compiler time, generated code/Metro bundle bytes, added providers and
consumers, allocations, render executions, host commits, layout counts, and
median/p95 commit time. Count hook subscriptions, not just host nodes. Hold
old interaction-context work distinct from work added by this proposal.

Timing is an experiment, not a noisy per-PR CI tripwire. Pin Node/RN/React,
build mode, source SHA, device/runner, workload and sample count; retain every
sample. Use at least 20 paired A/C or B/C trials after warm-up, alternate
order, and include an A/A noise control. Production timing and profiling
counts are separate measurements; emulator timings are not physical-device
claims. No broad default rollout on emulator timing alone.

Proposed review budget, fixed before the experiment: closed static fixtures
must have unchanged inheritance imports/subscriptions/host structure; zero
additional context-caused executions is a deterministic gate. For comparable
existing-correct runtime cases, investigate a repeatable median or p95
slowdown above the larger of 5% and 0.25 ms per commit. These are provisional
review thresholds, not observed results or an allowance to hide regressions.
If noise cannot resolve that budget, classify performance as inconclusive,
not passed. Record byte/allocation deltas explicitly; no arbitrary bundle
increase is implicitly approved. The user reviews nonzero trade-offs before
enabling the default path.

If ordinary Context still over-notifies important workloads, stop expansion
and compare a narrowly scoped selector/store prototype. That would need
concurrent-render/SSR-safe subscription semantics and its own measurements;
do not smuggle a second reactive engine into this RFC's first implementation.

## 7. Implementation slices and stop conditions

Slice 1's reproducible code/props/counting harness and its evidence limits
are described in [the baseline guide](../native-text-inheritance-baseline.md).
It does not implement the runtime protocol or accept this RFC.

The same guide now also records a **test-only** partial Context reference.
It exercises two channels and the legacy-size bridge without enabling a
production path. Its remaining lowering gaps and generic-Text
over-subscription are evidence for the next slice, not an accepted trade-off.
The guide also records a private partial-C paint-read elimination experiment:
literal masking plus stable component-identity proof, with rejected proofs
retaining B. It is not production compiler integration or default rollout.
An additional opt-in compiler/reference experiment retains plain View
typography and relative-root ratios. It repairs the two selected information
loss cases but conservatively adds runtime work; ordinary compilation stays
unchanged. This does not satisfy the closed-static/performance rollout gates.
A bounded follow-up restores ordinary RN Text bindings for proven complete
literal leaves in the expanded reference. Mixed/open uses retain Context;
the guide records paired work counts and identical lowered bytes. This is
still private loader wiring, not whole-tree proof or production integration.
The follow-up also proves non-escaping local registered styles and static
arrays from actual class lowering. Unknown/mutable style routes retain the
reference; this does not introduce a second Tailwind resolver or enable a
production path.
A separate private region proof permits nested Text only when each node
independently owns the complete supported frame. A partial/opaque descendant
keeps publication and runtime reads. It records host grouping as well as work
counts; it does not fold partial inherited styles or remove View providers.
A separate private native-region experiment delegates known partial Text
descendants to RN's existing nested-Text inheritance below a complete static
root. It records actual props separately from a source-backed attribute
projection and retains ordinary module bytes. The projection is not native
execution/device evidence; RN's own TextAncestorContext remains.
A shared-core factory and a private Native Storybook comparison now prepare
the next validation step (#1100). Both adapters use the same algorithm with
injected React/hosts/Context singletons. Generated static/runtime labels use
the existing proof, not render-time style heuristics. The story logs actual
layout callbacks only when run; its preparation and mock-host wiring tests
do not establish native rendering, performance or RFC acceptance.

The first **production-owned, internal opt-in** slice now lives in engine
and primitives. It is not the default lowering path. Passive Text/View
roots use shipped generated-code leaves; the independent private reference
remains the differential oracle. See the baseline guide's
[integration scope](../native-text-inheritance-baseline.md#production-owned-internal-opt-in)
for the assessed domain and remaining gates. This conservative opt-in does
not yet port private static-erasure proofs, so even a closed static tree
pays runtime work when explicitly selected. It must not be enabled by
default on that evidence.

A [fresh production-helper comparison](../measurements/native-text-inheritance-production.md)
now independently reviews the four-panel Android/iOS PNGs, AX and binary
hashes, including context-only propagation beneath an opaque memo/View
boundary. These bounded rendering results do not measure its cost or port
the private static-erasure proof. The remaining integration and rollout
gates below are unchanged.

The [first internal production static selection](../native-text-inheritance-baseline.md#first-production-static-region-selection-internal)
now proves a bounded complete-class memo Text region in the existing
parser/Native backend. It retains the measured runtime-only control, and
failed proofs use that runtime ABI. That first compiler slice alone did not
establish a production static-path device result. It does not implement the
broader private inline/registered-style proof or enable default rollout.

The subsequent [five-panel comparison](../measurements/native-text-inheritance-static.md)
now independently reviews static-path/fallback pixels and actual binary
provenance on both OSes. The original iOS cold-discovery failure is retained;
the successful iOS-only follow-up used identical source and unchanged budgets.
The bounded two-platform rendering gate is complete, not the integration,
update-cost or rollout requirements below. The next implementation slice is
real typography/owner integration, not more panels in the same fixture.

1. Add current-behavior reproductions, a property/owner inventory, and the
   paired render-count/size benchmark fixtures. Record existing failures as
   failures, not newly supported cases. No production routing changes.
2. Prototype the two-channel reference protocol for non-animated primitive
   boundaries and generic reusable Text. Use internal test-only selection,
   not a public setup option. Measure the unavoidable open-boundary cost.
   Compare relative-size readers with the existing size context.
3. Add explicit proof-based static elimination and B/C differential tests.
   Preserve closed-static output and existing supported behavior. Missing
   summary and failed proofs take the runtime route within the protocol.
4. Integrate typography, actual pattern label scopes and rendered portal
   boundaries. Prove state/transition and accessibility invariants before
   any animated/portal default is changed. Do not multiply ad hoc per-widget
   forwarding implementations.
5. Review the full evidence and trade-offs before default rollout. Keep a
   pinned pre-change baseline and revertable commits. Then simplify parser
   forwarding incrementally; never delete it first and accept lower coverage.

Stop before rollout on correctness differences, unstable mount identity,
unknown transition/portal semantics, unbounded rerenders, unresolved timing
regressions or missing physical-device performance evidence. Keeping the
current implementation while improving the prototype is an acceptable
outcome. This document authorizes no implementation or claimed speedup.
