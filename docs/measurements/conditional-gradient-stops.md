# Gradients under different conditions

Part of #1230, registers domain, above [gradient ordering](tailwind-gradient-order.md).
Not an ordering policy change. The same defect as transforms, filters and
shadows under different conditions; see
[conditional shadow layers](conditional-shadow-layers.md).

## What was wrong

Tailwind's constructor writes `--tw-gradient-position` and a
`background-image` that reads `--tw-gradient-stops`; each stop colour and
position is its own register, and a colour rule also rewrites the stop list.
Hozo joined constructor and stops per condition, so:

- `md:bg-linear-to-b bg-linear-to-r from-red-500` at md: the md rule was a
  constructor with no stops, an empty gradient the browser drops, so the
  base `to right` gradient stayed.
- `md:from-red-500 bg-linear-to-r from-blue-500` at md: the md rule was a
  colour with no constructor, which writes nothing.

## What changed

Web only. Where conditions write different gradient slots (constructor,
`bg-none`, each stop's colour, each stop's position), every write becomes
Tailwind's register under a `--hozo-` name: a constructor writes the
position and `background-image: <kind>(var(--hozo-gradient-stops,
var(--hozo-gradient-position)))`; a colour writes its register and the stop
list (through `--hozo-gradient-via-stops` for `via-*`); a position writes
its register. `bg-none` keeps its literal `background-image: none`, as
Tailwind's rule does. Initial values are Tailwind's (`#0000`, `0%`, `50%`,
`100%`). `via-none`, an arbitrary `bg-[…]`, or a constructor and `bg-none`
in one condition keeps the old output for the element.

## Not covered

- **Native**: Hozo's Native gradients are not changed here.
- The runtime candidate sheet, as for the other families.

## Verification

- **Chromium, real Tailwind as the oracle**: 8 inputs (conditional
  constructor, conditional from/to/via colour, conditional position,
  conditional `bg-none`, three conditions, and a same-slot control) in both
  orders, 500/1000px, LTR/RTL, reading computed `background-image`.
  **64 of 64 agree.** On the parent the `md:bg-linear-to-b` input alone
  disagreed in 4 of 8.
- `conditional-gradient-registers.test.ts`: the conditional constructor
  writes position and reader under the query; a conditional `via-*` writes
  its register and the stop list but no `background-image`; one-condition,
  same-slot, `via-none` and arbitrary-image inputs keep literal output. The
  test first listed `bg-linear-to-r from-red-500 md:from-blue-500` as
  same-slot; it is not (md has a colour and no constructor), and it
  correctly gets registers.
