# 11. Styling inputs keep their own cascade; equal-weight inputs compose in JSX order

**Status:** decided
**Date:** 2026-10-23

## Why

Tailwind and StyleX both produce conditional style declarations, but a
`Condition` alone cannot describe their precedence. Tailwind emits `focus`
before `focus-visible`; StyleX 0.19 gives `:focus-visible` atomic priority
3040 and `:focus` 3150 for `backgroundColor`. Sorting all conditions by a
single table silently changes one frontend to resemble the other.

Flattening all inputs into condition groups also loses JSX composition. With
a Tailwind focus rule, a Tailwind active rule and then a StyleX focus rule,
merging the last focus write into the first focus group moves it before the
active rule. The same defect affects both generated CSS and Native arrays.
An unrelated StyleX padding must not disable Tailwind's own class ordering.

## Decision

1. Keep the source kind and input boundary on each IR declaration. A static
   `className` and each resolved `stylex.props(...)` spread are distinct
   inputs, identified by their attribute offset in the current module. The
   offset is not a runtime ID or a persisted finding identity.
2. Resolve ordering **within** the input using its frontend: Tailwind's
   generated variant order and specificity; StyleX's atomic property/pseudo
   priority and argument resolution. Do not reinterpret StyleX through the
   Tailwind table.
3. Compose inputs using CSS specificity first, then JSX input order for
   equal weights. A later single-state input does not defeat an earlier
   more-specific conjunction. This is Hozo's explicit mixed-input contract,
   not a claim that upstream compilers combine two JSX `className` writes.
4. Group identical conditions only within a source region. Adjacent equal
   groups may coalesce, but a later input must never merge backwards across
   an intervening rule. Native gives separate surviving groups separate
   StyleSheet names, then follows the same ordering as the Web output.
5. Derived declarations that still represent the authored write retain its
   source: dark copies, text-metric folding, subtree and pattern adaptation.
   Compiler/semantic defaults without an authored input use `Unspecified`.

This refines ordering inside decision 009's tiers; it does not replace them.
Caller fallback classes still sit between resting and owner-state styles.
An explicit JSX/spread `style` still composes outside these tiers. Opaque
strings still use the candidate resolver. No new app-wide cascade engine,
state subscription, runtime provenance object or per-frame sort is introduced.

## Implementation boundary

The first shared specificity linearization assesses base styles, weightless
expression guards, hover/focus/focus-visible/active and positive conjunctions.
A domain containing a selector whose weight is not modeled retains its
existing group order. It is not assigned zero specificity, dropped, or newly
refused. Broader predicates, utility tie ordering and static/caller state
conflicts remain separate #1230 work. A known domain inside one Tailwind
input is still ordered even when an unrelated StyleX input exists.

Single-source grouping retains its direct path without the extra mixed-source
sort/coalescing. Provenance increases compiler IR data, not emitted runtime
data; this is not a claim of zero compile-time or bundle-size cost. The text
inheritance default and its device/AT rollout gates are unchanged.

Rust consumers constructing `StyleDeclaration` directly must set its new
`source` field (`StyleSource::Unspecified` for compiler defaults or an input
without frontend provenance). This intentionally changes the pre-release IR
construction API. Surviving mixed-input rules may require more static style
entries than the old, incorrectly merged output; those entries are not a
runtime provenance/sorting mechanism.

## Evidence

The [builtin spacing follow-up](../measurements/tailwind-utility-cascade.md)
adds shared utility keys inside one Tailwind input/condition. Input identity
does not include the utility key; class-source boundaries and StyleX priority
therefore remain unchanged. This is a bounded first utility domain, not a
universal sort across expression guards or logical/physical aliases.

- `crates/hozo_ir/src/lib.rs`: source-aware `group_by_condition` regression
  keeps focus/active/later-focus apart and checks conjunction specificity.
- `packages/compiler/src/interaction-order.test.ts`: all 16 owner-state
  combinations, both input orders, ordinary/inherited Native, StyleX argument
  precedence and more-specific earlier input in either frontend.
- `examples/storybook-demo/scripts/caller-composition.test.mjs`: real Tailwind
  CSS and official StyleX Babel-plugin CSS, composed in the documented input
  order, compared with Hozo CSS under actual hover/down/up/keyboard focus.
  Actual browser facts also drive the Native selected-style comparison.
- Existing StyleX shorthand/atomic priority, mixed transforms, caller/spread
  and inheritance tests remain required. These are style-selection checks,
  not fresh Native pixel, event-delivery, AT or timing evidence.

## Rejected / revisit

- **One global condition sort:** changes StyleX priority.
- **Keep mixed nodes unsorted forever:** unrelated styles break Tailwind.
- **Merge all equal conditions:** moves later writes backwards.
- **Make the last input win regardless of specificity:** Web and Native diverge
  on conjunctions unless CSS is replaced by a runtime emulation.
- **Resolve all styles at runtime:** unnecessary for compile-time provenance.

Revisit when upstream priority/specificity changes, when expanding the known
selector domain, or when real mixed static/caller-state evidence requires a
change to decision 009. Model those facts explicitly rather than inferring
source ownership from a component name or an already-flattened predicate.
