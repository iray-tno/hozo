# Tabs repeated-owner spike (RFC010)

## Unavailable-owner baseline

After the BottomSheet lifetime correction, Tabs is the next repeated-owner
probe in RFC010 phase A. Each tab owns selected/disabled and its own pointer
and focus state; one strip-wide class string does not give sibling tabs the
same facts. No Tabs contract is promoted merely by naming that owner.

The first source check found a real Web/Native discrepancy: Native supplies
`disabled` to its Pressable, while Web supplied only `aria-disabled` and skipped
the tab in roving focus. The Web button remained programmatically focusable
and did not match Tailwind's `:disabled` or compiled Hozo's
`[data-hozo-disabled]`. The click handler's guard alone is not native button
unavailability (decision 001).

The Web tab now supplies both `disabled` and the compiled selector marker,
alongside its existing ARIA state and roving tab index. Enabled siblings omit
both attributes. No new runtime helper, subscription, state machine, style
normalizer or dependency is involved. Existing selection, panel identity and
disabled arrow-skip logic remain unchanged.

The strengthened SSR regression fails before correction and passes afterwards;
the prior assertion explicitly forbidding a native disabled attribute was
incorrect for decision 001 and is replaced rather than preserved as a policy.
The focused wiring suite has 14 passing tests. The UI wrapper's duplicate
old expectation and its explanatory comments are updated to the same policy;
its existing `aria-disabled:` look remains valid and unchanged. This is DOM markup/owner-state
evidence, not browser event delivery, computed style, Native pixels, assistive
technology, performance or a completed owner audit. Real browser and Native
resolver comparisons follow as separate evidence, not implied by an SSR pass.

## Repeated live facts, before prepared caller rewriting

`tabs-owner-state.test.ts` runs the actual Native Tabs and shared Pressable
hooks against the existing RN host stand-ins. Its candidate map is generated
in one real prepared Tailwind context, not an invented rank table. Three tabs
share the same nine candidate tokens and independently own their selection,
disabled, hover, focus and press facts. The sequence is initial, hover second,
focus second, press second, select second, then a controlled selection of the
disabled third tab. The last case checks `aria-selected:disabled:p-3` without
borrowing a sibling's interaction. Existing positional host identity and
callback behavior must remain stable, including rejecting direct activation
of the disabled tab. The state changes do not rebuild the candidate map.

`owner-tabs.test.mjs` repeats that sequence using the actual Web component,
real browser pointer/focus/click delivery and two separate stylesheets:
Hozo's candidate output and independently compiled Tailwind CSS. Each phase
checks all three hosts, not just the active one. Six phases mean 18 Native
host observations and 36 Web observations (18 candidate + 18 Tailwind).
Natural button dimensions are normalized only for the deliberately large
focus/press widths/heights; the other captured values are computed styles.
An unavailable button must reject programmatic focus and click. Removing
its native/compiled unavailable hooks must visibly remove `disabled:` opacity,
even with `aria-disabled` still true: the two facts are not conflated.

Both receipts retain source commit, dirty status, the actual prepared Native
context fingerprint, passed/failure and partial observations. CI runs these
directly and uploads `owner-tabs-evidence` even on failure. The ordinary
Storybook test list includes the browser test; exact raw-source Turbo inputs
cover the helper and its compiler/Tailwind implementation dependencies.

The local Native test and oracle/bundle preparation passed. No local browser
was launched: browser results require an inspected CI receipt. Native event
handlers are invoked by the test, not an OS or screen reader. This establishes
bounded actual-owner facts in the existing component-managed route, not a
prepared Tabs caller carrier, full text/author composition, a manifest audit,
general interaction compatibility or default compiler adoption. Those remain
separate gates for extending the application seam.

The first browser CI run (`41273375045`) failed before any state progression:
the shared UA reset used an unlayered `border:0`, overriding the candidate
utilities' layer, so the expected disabled border width painted as zero.
Inspection of actual emitted CSS confirmed its border rule was present.
Both subjects now use a solid-border reset in the base layer and retain the
3px expectation; changing only border-style would not fix that precedence.
Its Native companion
also failed before executing because this narrow workflow had not built
Metro's source-transform entry; that dependency is now an explicit build
target, not a heavy Metro application bundle. These are harness defects,
not product failures or flakes; the original log/partial receipt is retained.

## Explicit Native prepared receiver

Tabs now has an internal `hozoTabStyle` callback. It receives a fresh snapshot
of the existing Pressable's interaction and that individual tab's disabled,
aria-selected and aria-disabled booleans. The ordinary resolver consumes those
same facts; a callback may not coexist with tabClassName and double-apply it.
No event machine, wrapper, subscription, rank calculation or style cache is
added. The ordinary path does not read manifests or allocate a second snapshot.

Both routes still use the existing box/text split and normalize authored
tabStyle at the host style evaluation boundary, after the class contribution.
Independent prepared marker tests check per-tab facts, selected+disabled,
hover isolation, string-label color, stable positional hosts and restoration
after frozen author gap/opacity overrides are removed. The marker callback's
mutation cannot alter real host/sibling state. A traced actual candidate map
positively witnesses the opaque route and verifies that the prepared marker
does not request a removed class string.

These marker functions are deliberately not a compiler producer. This proves
the receiver boundary against RN host stand-ins, not compiled Tabs caller
rewriting, native OS behavior or an audited contract. String labels retain
their existing text behavior; opaque label inheritance is not newly certified.
The backend must next supply explicitly declared semantic facts through its
existing condition/priority renderer rather than parsing classes in JavaScript
or manufacturing a second interaction owner. Default routes and published
manifest data remain unchanged.

## Explicit compiled semantic inputs, not a second cascade

The internal Native `ownerStyle` preparation request can additionally declare
`ownerFacts`: `disabled`, `aria-selected`, and `aria-disabled`. Only a literal,
class-only leaf Pressable is eligible in this mode. These inputs come from
the existing destination; the synthetic leaf's JSX is not a replacement for
that destination. The backend adds callback bindings to its existing guard
renderer and returns the declared keys beside the actual carrier. No class
parsing, rank calculation, interaction engine or JavaScript style planner is
added. Ordinary compilation and existing preparation without facts retain
their output; the request does not mutate the compiler's later calls.

A declared but missing/nonboolean runtime value is unavailable, not false.
The existing scoped guard keeps that availability check outside negation.
An undeclared semantic predicate, unknown fact, duplicate declaration or facts
without ownerStyle is rejected. Text, inherited/ambient context, extra host
props, wrappers and captured expressions still cannot receive a partial plan.
Semantic residual class inputs are also refused: their resolver delivery has
not been proved. This is not a general component/manifest authoring API.

`tabs-compiled-owner.test.ts` prepares one real module and the opaque candidate
map together in the same completed finite Tailwind batch. The test consumes
the returned style expression directly and creates its stylesheet once before
rendering. It then passes the callback to the real Native Tabs receiver and
compares the base nine candidates, six phases and three owners against both
the traced opaque route and independently specified semantic expectations.
Both routes retain the same positional hosts, reject disabled activation and
observe controlled selected+disabled separately from user activation. This
adds 18 prepared and 18 opaque host observations, not 36 different candidate
capabilities. JSON receipts include the exact source, dirty flag, context
fingerprint, carrier, partial rows and request counts, including on failure.

The first local delivery run matched every style tuple but its final harness
assertion incorrectly rejected the outer Tabs' existing empty class-input
calls. The assertion now checks that no class **string** is re-resolved on the
prepared route, while requiring positive literal requests on the opaque
control. No runtime implementation was changed to satisfy that measurement.

This is Native component-host-model evidence, not Android/iOS event or pixel
proof. The adjacent browser comparison still evaluates the ordinary Tabs
route against Tailwind, not a Web prepared carrier. Ordinary adapter adoption,
production bundle cost and a full owner audit remain separate gates. Default
adapters, published manifests and the owner-audit count are unchanged.

## Compiled carrier with authored overrides

The compiled delivery probe adds two axis-gap candidates to the original nine,
then applies and removes a frozen authored array on both opaque and compiled
routes. The author's explicit row gap stays 5, generic gap supplies column 7,
and authored opacity/background override every state contribution. Removing
that array restores class gaps 3/2 and each tab's selected/disabled look,
without replacing any of the three positional hosts or rebuilding the single
compiled stylesheet. Class entries are frozen too, so composition cannot
silently mutate the hoisted plan. Six additional author-phase rows record
18 host observations independently of the existing state progression.

Getter counts are measured immediately around explicit host-style evaluations:
one read per tab, and none from a retired author afterwards. React 19's
development renderer profiler also reads changed props to log their diff;
the initial local assertion incorrectly counted that instrumentation as an
eager component read. A stack trace located it in `logComponentRender`, not
Hozo. The separate initial-mount marker test still requires zero reads before
host evaluation. No product code, getter policy or timeout was changed for
this distinction. The receipt retains both total and host-evaluation counts.

This closes the bounded compiled **box**/author composition check. Ordinary
caller integration remains a separate gate, as do Web
prepared delivery, device pixels, performance and full owner audit.

## Explicit split-label carrier

Native preparation may declare `ownerText: 'split'` only with `ownerStyle`.
The returned carrier advertises `splitText: true`; a destination must already
separate its box and owned-label fields. The existing style/condition writer
keeps those assessed fields in one carrier, and Native Tabs uses its existing
`splitTextStyle`. No Text host, inherited context, extra callback or resolver
is installed. The synthetic JSX remains preparation scaffolding, not a
replacement for the destination. The old box-only caller preview explicitly
refuses this carrier until a matching text destination is declared.

Newly captured text fields are bounded to context-independent values: colors,
alignment/transform, portable themed/numeric weights and absolute metrics.
Parent-relative font sizes, ratio line-height, relative tracking, subtree
selectors, dynamic class residuals and ambient/wrapper effects remain refused
as a whole plan. This does not narrow ordinary compiler support; ordinary
compilation and preparation without this explicit destination are unchanged.

The real Tabs probe now uses 16 candidates (the original nine, two gap axes
and five label candidates), comparing each actual string label's color, 18px
size, disabled weight and hover spacing on both routes through all six phases.
Text paint/metrics must be absent from the box. Labels retain those values
through all three authored-box phases, while existing frozen-author/host/getter
checks remain in place. Unit evidence additionally covers absolute line-height,
theme capture, destination validation and ordinary-output stability. This is
not opaque-label inheritance, Web prepared delivery or Native font pixels.

## Selected data-contract caller preview

The bounded shadow reader accepts an optional shape `inputs` declaration with
up to three known semantic booleans and a `splitText` destination. No code or
arbitrary expressions are accepted. This first stateful caller consumer
requires a Pressable/button shape declaring the complete four-field existing
interaction snapshot; partial event owners remain unassessed rather than
inferring requirements from emitted JSX. Shapes without inputs keep the old
state-independent rule. All shapes must still agree on the assessed carrier,
metadata and stylesheet before any caller edit is published.

`tabs-owner-shadow.mjs` explicitly selects the catalog contribution for the
measurement; it no longer defines a second contract. It is not an audit. The generic caller preview
uses it to request the backend inputs/destination, hoist one stylesheet and
replace only the literal class attribute. Backend callbacks are preserved as
callbacks, not wrapped into a function returning a function. Authored props
are left at their original position and are never eagerly normalized or
captured into the module hoist. Unsupported/opaque/spread/double-carrier
inputs retain the original caller, as do missing destination/facts and
contradictory shapes. Old BottomSheet preview behavior remains covered.

The actual Native probe collects the direct module and caller-preview handle
in the same completed Tailwind batch as the opaque map. It finds results by
module identity, not an assumed collection order. The transformed `Caller`
module is loaded and rendered as a third route, not reduced to a hand-authored
callback. All three routes match six phases x three tabs (54 state-host
observations), plus three author phases x three tabs (27 author-host
observations), including label values and stable positional hosts. Both
prepared routes request no class string; the opaque control positively does.
The caller emits one hoisted stylesheet site and keeps the same prepared
callback identity through updates; the direct producer separately measures
one actual stylesheet creation. Those are scoped counts, not app-size or
render-time measurements.

This is still an explicit selected-contract preview, not normal Vite/Metro
adoption, cross-instance Tabs execution, Web prepared behavior, an audited
owner or legacy removal. The receipt cannot audit its own contract.

## Catalog and package publication

The existing experimental package channel now publishes `Tabs.Tab` from
`@hozo/patterns`, referenced only by its actual `Tabs` / `HozoTabs` value
exports. The UI/core facades do not acquire that contract by spelling or
re-export. The catalog is its single authoring location; generated shadow JSON,
the patterns manifest and the selected probe read the same contribution.
Miniature BottomSheet tests explicitly select their owner rather than depending
on the catalog containing just one contract. A multi-owner document is still
not accepted by the single-owner caller API: production selection belongs to
the existing captured instance/export/class-prop path.

`splitText` describes the current receiver, not universal text inheritance.
Native Tabs sends text fields to its own Text only for a string label; a supplied
ReactNode stays untouched. `tabStyle` remains the existing authored **box**
override. Publication does not solve opaque-label inheritance, certify parity
for every label shape, promote the pending catalog slot, or enable adapters.
Both contracts remain `audit: unknown`; the shadow inventory rises from one
to two while every global coverage/audit measure remains unavailable.
