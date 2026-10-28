# Canonical order for normalized disabled owners

This continues #1230 above [#1362](https://github.com/iray-tno/hozo/pull/1362).
That dependency fixes owner delivery; this layer only graduates a proven
condition into the shared original-rule assessment.

## Boundary

Exact `[aria-disabled="true"]` is now an assessed owner predicate, including
conjunctions with already-assessed hover, disabled and other positive ARIA
conditions. Its atom is distinct from `:disabled`. Even where normalization
delivers equal boolean values, the compiler must match the original selector
and IR predicate multiplicities instead of substituting one for the other.

The existing shared rule comparator supplies specificity and emission order.
The change adds one compiler-side evidence slot, not a utility precedence
table, runtime sorter, provider, new state key or new generated helper. The
static and generated paths reuse the owner facts repaired in the dependency.
`scalar-order-v7` invalidates v6 fingerprints and validly hashed old-policy
Metro transfers. This changes the assessed domain, not descriptor identity.

Negated, false-valued, hidden/pressed and other unproved selectors remain
unassessed; unknown emitted guards still preserve the complete old input.
Mixed frontend/style tiers retain ADR 011. Standalone/WASM default behavior,
logical/gap/register/relative-text work and other six-group migration pieces
are not changed here.

## Evidence

The positive-ARIA Native differential now has **512 observations**, including
independent explicit/state-disabled/hover values, other ARIA states and both
class orders. A further **288 observations** execute actual compiled
Button/Pressable/Link props and styles, in static and opaque dynamic-class
forms, with optional/null/false/true state and explicit flags. The generated
resolver is executed, not reconstructed from class names. Other state fields
must survive delivery and pointer press cannot stand in for disabled.

The real-browser oracle has **256 reference/compiled observations**, with both
class orders. It verifies that the actual compiled host is a button, projects
actual Web props onto it, independently normalizes reference owner inputs,
reads back real hover/disabled behavior and compares upstream Tailwind CSS
against static Native and generated-map styles. The legacy whole-input route
is a required failing control, not accepted as an equivalent implementation.

The first negative probe used an unparsed arbitrary false-valued ARIA token.
Its diagnostic did not create an emitted IR guard, so expecting it to freeze
unrelated base writes was a measurement error. The full-input barrier probe
now uses the supported-but-unassessed `not-aria-disabled` predicate. Rust still
explicitly rejects the original false selector and checks mismatched/duplicated
predicate atoms. The failing observation remains in the ignored artifact logs;
it is not a flake or a retry-to-green.

Final source passed workspace Rust **1,079 / one intentional ignored**, fmt
and all-target Clippy with warnings denied; a fresh debug addon; compiler
**360 / one existing skip**, Tailwind **154**, Metro **93**, Native
host/receipt/cache **145** and complete real-browser composition **36** tests.
Vite **62** and Next **21**, three affected package typechecks, ABI **57 leaves /
79 names**, metadata, receipt freshness, lint and generated docs also passed.
Source-probe inputs were checked with a Turbo dry run. One added assertion
needed a local Biome multiline-format correction; no production change was
made in response. Build integration and consistency evidence is in the PR and local
`artifacts/tailwind-order/namespace-invariance/aria-disabled-*` evidence. All
local work is CPU 1/Idle and serial. The Native fixture is regenerated through
its normal generator after source changes. A fresh addon precedes JS tests.
No new conformance percentage, fresh app/device/AT result, full root JS suite,
whole-app speedup or completed six-group migration is claimed.
