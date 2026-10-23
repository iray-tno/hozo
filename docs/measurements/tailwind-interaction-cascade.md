# Tailwind owner interaction cascade: first correction

## The defect and the bounded correction

[#1230](https://github.com/iray-tno/hozo/issues/1230) found that the same literal
class list selected active blue in Tailwind but later-authored focus green in
both Hozo Web and Native. This correction orders Tailwind-owned `hover`, `focus`,
`focus-visible`, `active` and their positive conjunctions before the platform
backends diverge. Generated Native candidate groups carry the same numeric rank.
The original standalone reproduction now selects blue on all three paths.

The registration order is generated from Tailwind's `getClassOrder`, the same
API the project candidate stylesheet already queries. A test compares the
generated table against both that API and actual Tailwind CSS emission. The
Native key includes selector specificity before the variant bitset, since an
RN style array cannot let a more-specific conjunction win by itself. Equal
keys preserve authored/caller order; this is not a full utility-order rewrite.

The first correction reordered only the class-only parser region. Explicit
JSX style/spread precedence and decision 009's resting/caller/state tiers were
unchanged. Nodes containing StyleX were initially left alone because the IR
had no input provenance. The follow-up below removes that blanket restriction
by retaining source boundaries, not by sorting arbitrary StyleX conditions.
Domains with unranked predicates still retain their existing order.

## Runtime and performance boundary

There is no new runtime helper on static compiled elements. Native fallback
groups gain an optional third tuple entry, outside the RN style object. Old
two-entry groups remain valid; a mixed/unranked domain retains its old order.
The resolver sorts ranked groups once when it caches a new class string,
together with their warning provenance. Transform metadata continues to key
the same style objects. A rank-getter counter confirms that subsequent state
updates neither read nor sort rank metadata again. This is not a new class
parser or an app-wide reactive cascade engine.

Parser regions with no interaction or an already ordered interaction list clone
no style declarations. This is an allocation bound, not a measured claim of
zero compiler-time overhead or an overall speedup.

## Checks

- All 24 permutations of the four variants, all 16 owner-state combinations,
  ordinary Native, internal inherited Native and generated candidate resolution.
- A compound hover/focus selector outranking a single active selector.
- StyleX same-condition argument precedence in both argument orders; a mixed
  StyleX/Tailwind node explicitly retaining its existing order.
- Cache rank reads, equal-rank caller order and missing-fact warning provenance.
- Real Tailwind and compiled Hozo CSS in Chromium: twelve settled motion stages,
  intermediate colour inheritance, plus active `transform-none` defeating hovered
  `transform-cpu` on both sheets. The existing Native transform expectation is
  corrected to match that browser observation, while hover-only restoration
  remains tested.
- Existing compiler/engine, caller-composition, inherited motion, candidate
  transforms and device-fixture checks. Fixture provenance includes the new
  parser inputs; hashes do not claim a fresh Native pixel result.

## Still open

The source-provenance follow-up removes the mixed-StyleX blanket exemption:
each input now retains its own order, grouping cannot merge a later input
backwards, and bounded owner conditions compose by specificity then JSX order.
See [decision 011](../decisions/011-styling-inputs-keep-their-own-cascade.md).
The first correction and its observations above remain historical evidence;
mixed nodes are no longer a blanket reason to skip Tailwind ordering.

These corrections are not grounds to close the entire issue. Other conditional
domains, negation,
ambient/structural/group/peer predicates, custom variants, and utility tie order
need separate provenance/order handling. Do not globally sort all `Condition`
IR or fix only Native to expand that scope. Native event-delivery, motion pixels,
AT and physical-device timing are not measured here. The text-inheritance
default remains unchanged.
