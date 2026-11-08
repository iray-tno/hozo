# Gaps in Tailwind order

Continues #1230 above [logical edges](tailwind-logical-property-order.md).
Policy **scalar-order-v13**.

## What was wrong

`gap-*`, `gap-x-*` and `gap-y-*` were outside the ordering domain, so an input
with one kept its authored order. `md:gap-4 gap-2` kept `gap-2` at every
width, and on Native `active:gap-4 gap-2` never showed the pressed gap.

## What changed

`Gap`, `RowGap` and `ColumnGap` join the domain. `covers` already named their
declarations: `gap` owns all three writes, `row-gap` and `column-gap` their
own axis.

The [gap alias boundary](tailwind-gap-alias-boundary.md) kept gaps out until
the authored-style composition was settled. That boundary is about a
**different tier**: an explicit `style` composed above the classes, where
Yoga's axis gutter beats a later generic `gap` and CSS lets the later one win.
Ranking reorders writes **inside** one class input only, so it cannot reach
that composition, and the divergences recorded there are unchanged. Within
the class tier:

- Different keys (`gap-x-2 gap-4`): Yoga lets `columnGap` beat `gap` by key,
  and Tailwind emits `column-gap` after `gap`, so the two agree in either
  order before and after this change.
- Same key (`gap-2 active:gap-4`): only order decides, and Tailwind's order
  is the one the Web shows.

## Verification

- **Chromium, real Tailwind as the oracle**: 8 pairs in both authored orders,
  500px and 1000px wide, LTR and RTL, reading the element's computed
  `row-gap` and `column-gap`. **64 observations, 64 agree.** The legacy output
  disagreed in 18, for example `md:gap-4 gap-2` at 1000px.
- `gap-order.test.ts`: 8 pairs, each with no style, `style={{gap: 24}}` and
  `style={{rowGap: 4}}`, give identical Web CSS and Native static output in
  both orders. The generated Native map, run through the real resolver, gives
  `gap-2 active:gap-4` 8 at rest and 16 pressed in both orders, and
  `gap-x-2 gap-4` `columnGap: 8`, `gap: 16` in both orders.
- The boundary's own tests still pass unchanged:
  `gap-alias-reference.test.ts` (4) and the `gap` cases of
  `caller-composition.test.mjs`; the whole `tailwind-conformance` suite
  passes (972).
- Three tests used `gap-2` as their example of an unranked neighbour; they now
  use `border-2`, which is still unranked on both paths.
