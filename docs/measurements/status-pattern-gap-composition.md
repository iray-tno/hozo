# Status-bearing Native pattern gap boundaries

This follows [the first four pattern owners](pattern-authored-gap-composition.md).
It does not enable canonical gap ordering or claim complete Native gap parity.

## Change

Tabs, Pagination and Stepper now use the existing `hozoAuthoredStyle` before
joining the author's style to class-derived gap axes. The19added authored
props cover Tabs root/list/tab/panel, Pagination root/item/current/disabled/
ellipsis, and Stepper root/step/status/indicator/status-indicator/description.
Compiler lowering, candidate data, ordering policy and generated ABI are
unchanged. No resolver, subscription or owner-state machine is introduced.

Status gates stay at their existing owners. Stepper constructs class tuples
eagerly before choosing a status; only the selected status's authored style
is projected, so inactive authored getters are not newly evaluated. A
throwing-getter regression covers all six inactive status style props. Existing
class-resolution and compiled-callback placement is preserved, not replaced
with a second runtime sorter. No-gap object identity and author-array
flattening retain the earlier helper's behavior and cost; widget render
performance is not measured here.

## Measurement

The actual Native-source/Yoga owner matrix now has31authored props in seven
components and35selected hosts (some pagination props style multiple hosts).
Each host runs four caller routes, three authored inputs and eight layouts:
**3,360 gap observations**. Exact host counts prevent selecting an arbitrary
ancestor or silently overlooking a second disabled/ellipsis/page control.

The expanded matrix reproduced **720/3,360** mismatches on unmodified main
ff7e4d90 and **zero** after the wiring. The original1,152observations are
retained. Real Native sources and the real generated candidate map feed
upstream Yoga3.2.1WASM; these are effective-gap layouts in a fixed fixture,
not entire widget/device layouts, AT or browser pixels. No headline support
percentage or report snapshot changes.

CPU1/Idle/serial local verification:

- Owner matrix, inactive getters, existing dynamic slots and inheritance:
  **61 tests passed**, no skips.
- Pattern typecheck and **156 unit tests** passed.
- Full candidate-cascade and Native control/indicator files: **174 passed**,
  no skips (65.36s).

No Rust source changed from the previously verified addon; no addon rebuild
or full local root/app/Metro/device build was run. The first attempted baseline
found stale typography output lacking main's new CodeBlock export, not a
gap result. After the normal typography rebuild, the baseline was taken with
only these three owners restored to main, then the production patch was
reapplied and tested. All failed/setup/baseline/final logs are retained under
ignored `artifacts/tailwind-order/namespace-invariance/pattern-status-gap-*`.

## Next boundary

Interactive hover/press/focus gap transitions need their own changing-value
controls; rest-state matching does not prove event delivery. Other uncompiled
owners, clearing/null/percentage values, mixed StyleX tiers and contextual
grid also remain. Keep gap's canonical assessment barrier until that broader
evidence supports its removal. No changeset per user instruction.
