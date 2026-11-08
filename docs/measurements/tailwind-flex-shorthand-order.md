# The flex shorthand in Tailwind order

Continues #1230 above [border widths](tailwind-border-width-order.md). Policy
**scalar-order-v18**.

## What was wrong

`flex-1`, `flex-auto`, `flex-initial` and `flex-none` had no ownership entry,
so an input with one kept its authored order. `md:flex-none flex-1` kept
`flex-1` at every width, and `grow-0 flex-auto` grew where Tailwind keeps the
item at `flex-grow: 0`.

## What changed

Hozo lowers each to one `Flex` write, which is one `flex` declaration in
Tailwind's rule, so it joins `scalar_css_property` as `flex`.

On Native the write projects to `flex` (`flex-1`) or to `flexGrow` and
`flexShrink` (`flex-auto`, `flex-initial`, `flex-none`), the same keys
`grow-*` and `shrink-*` write. Yoga takes an explicit `flexGrow`,
`flexShrink` or `flexBasis` over `flex` by key, and Tailwind emits
`flex-grow`, `flex-shrink` and `flex-basis` after `flex`, so the two agree
across keys; where the keys coincide (`flex-auto grow-0`, both `flexGrow`),
ranking now gives Tailwind's answer in either order.

Not changed: `flex-1` is `flex: 1` on Native while `flex-none` is two
longhands, so `flex-none md:flex-1` keeps `flexGrow: 0` at `md` by key, as it
did before. Arbitrary values (`flex-[2_2_0%]`) are not a `Flex` write.

## Verification

- **Chromium, real Tailwind as the oracle**: 11 pairs in both authored orders,
  500px and 1000px wide, LTR and RTL, reading computed `flex-grow`,
  `flex-shrink` and `flex-basis`. **88 observations, 88 agree.** The legacy
  output disagreed in 34.
- `flex-shorthand-order.test.ts`: 9 pairs give identical Web CSS and Native
  static output in both orders. The generated Native map, run through the real
  resolver, gives `flex-auto grow-0` `flexGrow: 0` and `flexShrink: 1`, and
  `hover:flex-auto flex-none` 0 at rest and 1 hovered, in both orders.
