# Every boolean ARIA state in Tailwind order

Continues #1230 above [coverage](tailwind-order-coverage.md), where
`aria-pressed:` held four class lists of this repository on the old path.
Policy **scalar-order-v38**.

## What was wrong

[Bounded positive ARIA ordering](tailwind-aria-owner-order.md) assessed six
of the nine boolean states Tailwind names (`busy`, `checked`, `expanded`,
`selected`, `invalid`, `disabled`) and left `hidden`, `pressed`, `readonly`
and `required` for a later measurement. An input with one of them kept its
whole class list in authored order: `p-4 p-2 aria-pressed:p-2` took 8px
padding where Tailwind takes 16px.

## What changed

`aria_owner_index` names all ten, and the negated forms follow from it.
Each is one attribute selector of one class weight,
`&[aria-<state>="true"]`, the shape the other six already have. Delivery is
unchanged: Native resolves every `aria-<state>:` guard through the same
`accessibilityState` read or a pattern slot's own fact (`Chip` supplies
`aria-pressed`), so ranking one decides which write wins, never how its
guard is delivered. A spelling outside the closed set (`aria-pressed="mixed"`,
`aria-current`) is still unassessed, and arbitrary `aria-[…]:` values are not
parsed at all.

`aria-owner-order.test.ts` compared its unassessed neighbours with a
pass-through context, which since the [built-in
default](tailwind-builtin-order-default.md) ranks too and so no longer
proved anything; it now compares with authored order, and its neighbours
are spellings that are still barriers (`not-hover:`, `aria-pressed:not-hover:`).

## Verification

- **Chromium, real Tailwind as the oracle**: 16 inputs (two values under one
  state, a state beside a base conflict, negated against positive, two
  states against each other) in both orders, on an element with no ARIA
  attribute and with each of the four (and two together), reading padding:
  **192 of 192 agree**; authored order disagreed in 27.
- `aria-state-order.test.ts`: the 16 inputs give identical Web CSS and
  identical Native diagnostics, styles and JSX in both orders; authored
  order is order-sensitive for them; the generated Native map marks every
  group orderable.
- Coverage: **296 of 320 inputs ranked (92.5%)**, up from 292 (91.3%).
