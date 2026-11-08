# Corner radii in Tailwind order

Continues #1230 above [gaps](tailwind-gap-order.md). Policy
**scalar-order-v14**.

## What was wrong

The eight corner radii (`rounded-t-*`, `rounded-tl-*`, `rounded-s-*`,
`rounded-ss-*` and the rest) had no ownership entry, so an input with one
kept its authored order. `md:rounded-t-lg rounded-t-sm` kept the small corners
at every width, and `rounded-tl-none rounded-l-lg` rounded the corner Tailwind
squares.

## What changed

Each corner is one Tailwind declaration and one Native key, so each joins
`scalar_css_property` directly: `BorderTopLeftRadius` owns
`border-top-left-radius`, `BorderStartStartRadius` owns
`border-start-start-radius`, and so on. A side utility (`rounded-t-*`) is two
such writes, as Tailwind's rule is two such declarations.

[Direct properties](tailwind-direct-property-order.md) left the corners out
because Yoga lets `borderTopLeftRadius` beat `borderRadius` by key, whatever
their order. That stays true, and is why ranking is safe: it cannot change
which key Yoga applies, and Tailwind emits every corner after
`border-radius`, so the class tier agrees either way. Ranking only moves
writes to the same corner key and the Web cascade.

Not changed: a later all-corner rule over a corner, as in
`hover:rounded-none rounded-t-lg` while hovered, still keeps the corner on
Native, where CSS lets `border-radius` replace it. That was so before, in
both authored orders.

## Verification

- **Chromium, real Tailwind as the oracle**: 12 pairs in both authored orders,
  500px and 1000px wide, LTR and RTL, reading all four computed corner radii.
  **96 observations, 96 agree.** The legacy output disagreed in 33.
- `corner-radius-order.test.ts`: 9 pairs give identical Web CSS and Native
  static output in both orders. The generated Native map, run through the
  real resolver, squares `borderTopLeftRadius` for `rounded-tl-none
  rounded-l-lg` and `borderStartStartRadius` for `rounded-ss-none
  rounded-s-lg`, in both orders.
