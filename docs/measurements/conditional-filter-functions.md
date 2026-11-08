# Filter functions under different conditions

Part of #1230, registers domain, above [filter ordering](tailwind-filter-order.md).
Not an ordering policy change. The same defect and the same fix as
[transform axes under different conditions](conditional-transform-axes.md).

## What was wrong

Tailwind keeps each filter function in its own register (`--tw-blur`,
`--tw-grayscale`, …) and reads them all in one `filter`, so
`md:blur-sm grayscale` is `blur(8px) grayscale(100%)` at md. Hozo joined
the functions per condition, so on Web the md rule was `filter: blur(8px)`
and the base grayscale was lost. `backdrop-*` did the same.

## What changed

Web only. Where conditions write different filter functions, each becomes a
non-inheriting `--hozo-<function>` register with no initial value, read as
`var(--hozo-blur,) … var(--hozo-sepia,)` in Tailwind's order;
`backdrop-filter` reads `opacity` before `saturate`, as Tailwind's does. The
`@property` block is now generated from one list of 28 registers rather than
written out by hand. `filter-none`, `filter-[…]`, a drop shadow and a drop
shadow colour keep the old literal output, as does an element whose
conditions write the same functions.

## Not covered

- **Native** still replaces the whole `filter` string per condition: there
  is no filter slot composer like `hozoTransformStyles`. Writing one is the
  next step for this defect.
- `md:blur-sm grayscale lg:filter-none` keeps its old output, so at md the
  oracle still disagrees (4 of 8 observations), before and after.
- The literal backdrop chain sorts `opacity` last, unlike Tailwind; only the
  register form here reads it in Tailwind's place.

## Verification

- **Chromium, real Tailwind as the oracle**: 8 inputs (function against
  function under `md:`, brightness/contrast, backdrop blur/opacity, same
  function, `md:`/`lg:` together, the `filter-none` case, and the transform
  inputs from the previous layers as controls) in both orders, 500/1000px,
  LTR/RTL, reading computed `filter`, `backdrop-filter`, `transform` and
  `translate`. **60 of 64 agree**; the 4 that do not are the `filter-none`
  input above.
- `conditional-filter-registers.test.ts`: the split input has the registers,
  `@property` and Tailwind's read order for both `filter` and
  `backdrop-filter`; one-condition, same-function, reset and drop-shadow
  inputs keep literal output.
