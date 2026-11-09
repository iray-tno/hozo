# `not-hover:` in Tailwind order

The last domain 5 gap in the [inventory](tailwind-order-inventory.md).
Policy **scalar-order-v51**.

## What was wrong

Tailwind writes `not-hover:p-2` as one rule with two branches holding the
same declarations:

```css
.not-hover\:p-2 {
  &:not(*:hover) { padding: … }                  /* a device that can hover, not hovered */
  @media not (hover: hover) { padding: … }      /* a device that cannot hover */
}
```

The assessment read one branch per rule, so `not-hover:` was a barrier and
its input kept authored order. On Web that was also wrong on its own: Hozo
emits both branches where the class was written, so in `not-hover:p-2 p-4`
the media branch, at the base weight, came before `p-4` and lost to it. A
device that cannot hover got 16px where Tailwind gives 8px.

## What changed

- `not_hover_branch` recognises exactly that pair, the same body under
  `&:not(*:hover)` and `@media not (hover: hover)`, and the assessment
  reads it through the selector branch: one class weight and a new negated
  hover owner fact. The pair is one rule at one place in Tailwind's order,
  and ranking orders by that place (`order_scalars` sorts by rank alone),
  so both branches are emitted there and each keeps its own selector's
  weight on Web.
- `Condition::Not(Hover)` asks for that fact; ownership counts the body
  once.
- `container`, the other rule that splits into branches, stays a barrier:
  its branches compete with unprefixed `max-w-*` by place, and Hozo emits
  conditional styles after unconditional ones whatever the place. Recorded
  in [known gaps](tailwind-known-gaps.md).

## Verification

- **Chromium, real Tailwind as the oracle**, on a desktop page
  (`(hover: hover)` true) hovered and not, and a mobile page
  (`isMobile`, `(hover: hover)` false), 500 and 1000px: 6 inputs in both
  orders, including `not-first:p-1 not-hover:p-2`, where which rule wins
  depends on the device, and `not-hover:p-2 md:p-4`. **72 of 72 agree**;
  authored order disagreed in 4, all on the mobile page.
- `negated-variant-order.test.ts`: `not-hover:p-2 p-4` gives the same CSS in
  both orders, with the media branch after the unprefixed rule.
  `aria-owner-order.test.ts` uses `not-group-hover:` (still a branching
  rule) as its unassessed neighbour.
- Rust: `not-hover:p-2` assesses to `[0, 2, 0]` with the negated hover fact.
  `OrderRuleShape` and `OrderContextValue` gain `PartialEq` to compare the
  two branches.
- Inventory, domain 5: **0 gaps** (from 1). Repository coverage unchanged
  at 318/320.
