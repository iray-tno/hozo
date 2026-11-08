# Border colours in Tailwind order

Continues #1230 above [relations](tailwind-relation-order.md). Policy
**scalar-order-v16**.

## What was wrong

Border colours had no ownership entry, so an input with one kept its authored
order. `md:border-blue-500 border-red-500` kept red at every width, and
`border-t-red-500 border-y-blue-500` painted the top blue where Tailwind
paints it red.

## What changed

The eleven border colour writes join `scalar_css_property`, each owning the
one declaration Tailwind writes for it: `border-color`, the four physical
sides, `border-inline-color`, `border-block-color` and the four logical
edges. An axis writes two Native keys, as `px-*` does.

As with [logical edges](tailwind-logical-property-order.md), Native picks a
side over `borderColor` by key, whatever the order, and Tailwind emits every
side after `border-color`, so ranking cannot change which key applies; it
moves writes to the same key (`border-t-*` against `border-y-*`, both
`borderTopColor`) and the Web cascade. `border-s-* border-l-*` still differs
on Native as it did before.

Not changed: a colour with an opacity modifier (`border-red-500/50`) is two
declarations in Tailwind's rule (a fallback and an `@supports` upgrade), so
it stays unassessed, as `bg-red-500/50` does. Border width and style use
Tailwind's `--tw-border-style` register and are separate work.

## Verification

- **Chromium, real Tailwind as the oracle**: 11 pairs in both authored orders,
  500px and 1000px wide, LTR and RTL, reading all four computed side colours.
  **88 observations, 88 agree.** The legacy output disagreed in 30.
- `border-color-order.test.ts`: 9 pairs give identical Web CSS and Native
  static output in both orders. The generated Native map, run through the real
  resolver, gives `border-t-red-500 border-y-blue-500` a red top and blue
  bottom, and `active:border-blue-500 border-red-500` red at rest and blue
  pressed, in both orders.
