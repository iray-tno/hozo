# Shadow and ring layers under different conditions

Part of #1230, registers domain, above [shadow and ring ordering](tailwind-shadow-ring-order.md).
Not an ordering policy change. The same defect as
[transform axes](conditional-transform-axes.md) and
[filter functions](conditional-filter-functions.md) under different
conditions.

## What was wrong

Tailwind keeps every shadow and ring layer, each colour, the ring offset
width and colour, and the inset flag in a register, and reads five layers in
one `box-shadow`. Hozo joined the layers per condition, so a conditional rule
replaced the whole declaration:

- `focus:ring-2 shadow-sm`: while focused, `box-shadow: 0 0 0 2px
  currentcolor`; the shadow was gone. A focus ring on a shadowed control is
  a common pattern.
- `md:shadow-red-500 shadow-lg`: at md the colour rule alone, which paints
  nothing, so no shadow at all.

## What changed

Web only. Where conditions write different shadow or ring slots, every write
becomes the register Tailwind uses, under a `--hozo-` name: a shadow layer
reads its colour as `var(--hozo-shadow-color, <default>)`, the ring layer is
`var(--hozo-ring-inset,) 0 0 0 calc(<width> + var(--hozo-ring-offset-width))
var(--hozo-ring-color, currentcolor)`, `ring-offset-*` writes the width and
the offset layer, and an `initial` colour leaves the register
guaranteed-invalid so the default applies. Every rule that touches the
family reads the five layers. The registers are non-inheriting `@property`s
with Tailwind's initial values (`0 0 #0000`, `0px`, `#fff`). Conditions that
write the same slots (`shadow-sm md:shadow-lg`, `ring-2 focus:ring-4`) keep
the literal declaration.

## Not covered

- **Native** still replaces the whole `boxShadow` per condition.
- **Colour spelling**: Tailwind's shadow colour goes through
  `color-mix(in oklab, …)` and computes to `oklab(…)`; Hozo writes the
  theme's `oklch(…)`. Same colour, different serialisation, on the literal
  path as well (`shadow-lg shadow-red-500`: 0 of 8 agree, unchanged by this
  layer).

## Verification

- **Chromium, real Tailwind as the oracle**, transparent zero layers dropped
  as in the ordering layer: 10 inputs (ring against shadow, colour against
  shadow, offset, inset, `shadow-none` with a ring, inset ring with inset
  shadow, three conditions, `shadow-initial`) in both orders, 500/1000px,
  LTR/RTL, reading computed `box-shadow`. **72 of 80 agree**; the 8 that do
  not are the colour spelling above, with identical geometry. On the parent,
  the first four inputs disagreed in 12 of 32, most of them a missing layer.
- `conditional-shadow-registers.test.ts`: `focus:ring-2 shadow-sm` writes
  the shadow register in the base rule and the ring register under
  `:focus`, both read by one `box-shadow`; a conditional colour writes its
  register; one-condition and same-slot inputs keep literal output.
- `@hozo/ui` 86 and `@hozo/patterns` 165 tests pass unchanged.
