# Toggle and RadioGroup authored gap boundaries

Continues #1230 after the Slider/ColorPicker work in #1394. This is a bounded
Native author/class composition repair, not a new ordering policy, resolver,
subscription, ABI, canonical gap eligibility or headline conformance result.

## Reproduced boundary

Checkbox and Switch compose classes with the caller's style in the actual
Pressable style callback. RadioGroup does so at the group View and each
option's Pressable callback. All four public style inputs previously mixed
generic authored `gap` with class-provided row/column gaps before projecting
the author's effective axes. Yoga's axis priority then defeated the inline
author's intended precedence.

These owners now use the existing `hozoAuthoredStyle` at those four boundaries.
The callback-owned author stays in its callback, without eager parent
evaluation or mutable-style caching. The label's class/text split, checked
state, selection, interaction handlers and disabled semantics are unchanged.
The shared decorative control indicator accepts classes only, so it has no
authored StyleProp boundary to repair; no helper is added there by inventory.

## Evidence

The expanded real-source Metro/candidate/Yoga matrix covers **64 public style
props, 76 selected host/style channels and 7,296 rest observations** across
15 components. Four caller forms (raw, literal, opaque and spread), three
author inputs and eight layouts include both RadioGroup options. The
unchanged-production baseline reproduced **320 mismatches**, all in the new
generic/nested author cases; applying the four boundaries leaves **zero**.
No-gap controls retain their class axes. The existing **5,376 interaction
observations**, owner refusals, inactive Stepper accessor and delegated
ColorPicker thumb regressions remain passing.

Checkbox/Switch fixtures use their existing `@hozo/patterns` export,
RadioGroup uses its core facade export. No API is added to make a fixture
compile, and a literal caller is not a claim of universal AOT lowering.
The first setup attempt failed because a stale local typography build lacked
`codeRowKey`, before the assertions ran. A normal typography build fixed that
setup; both the failed setup log and corrected failing baseline are retained
under ignored `artifacts/tailwind-order/namespace-invariance/toggle-radio-gap-*`.

CPU1/Idle/serial verification includes pattern typecheck/build and **156 unit
tests**. The owner/input-slot/dynamic-slot plus Native-host/source-cache
checks pass **64 tests**, and the full candidate-cascade/Native-control files
pass **174 tests** (65.10s), with no skips. The expanded owner matrix passes
**5 tests** independently. Biome, generated docs/metadata/ABI (58 leaves,
81 names), Native text source receipts and diff checks pass. No raw-source
cache input is added: the existing conformance and Storybook tasks already
hash all pattern/engine sources used here.

## Limits and next evidence

Yoga3.2.1WASM measures effective gaps in a fixed fixture, not actual widget
layout, Native pixels, Fabric/OS gesture delivery or assistive technology.
The shared helper's existing no-gap fast path/author-array flattening remain;
no whole-widget speed or zero-overhead claim is made. No Rust source changed
from the verified addon. No full local root suite, app/device build or report
was run. No changeset per user instruction.

Actual checked/disabled/hover/press/focus transitions and class-only decorative
indicator isolation are a follow-up layer. Other owners, cross-slot/tier
competition, resets/percentages/direct style functions, mixed StyleX and
contextual grid still precede gap eligibility and old-path deletion. This does
not close any whole six-group migration family.
