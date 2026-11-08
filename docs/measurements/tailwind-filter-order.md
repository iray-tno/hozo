# Filter functions in Tailwind order

Continues #1230 above [conditional transform functions](conditional-transform-axes.md#skews-and-3d-rotations).
Policy **scalar-order-v28**.

## What was wrong

No filter function had an ownership entry, so an input with one kept its
authored order: `blur-sm blur-lg` took 16px where Tailwind
emits `blur-sm` last and keeps 8px, and `brightness-150 brightness-50` took 50%.

## What changed

Tailwind writes each filter function as a register (`--tw-blur`,
`--tw-backdrop-opacity`, …) read by one shared `filter`/`backdrop-filter`
that every such rule declares. Each `Filter`/`BackdropFilter` write owns its
register, as the transform axes do. `filter-none` writes the declaration
itself, and a drop shadow pairs its register with colour and size registers,
so both stay barriers. Native accepts `filter` and refuses `backdrop-*`
exactly as before.

## Not covered

Filters written under different conditions still replace each other's whole
chain (`md:blur-sm grayscale` loses `grayscale` at md), on Web and Native;
that is the composition defect fixed for transforms, not ordering.

## Verification

- **Chromium, real Tailwind as the oracle**: 10 pairs (same function,
  different functions, `md:`, backdrop) in both authored orders, 500px and
  1000px wide, LTR and RTL, reading computed `filter` and
  `backdrop-filter`. **80 observations, 80 agree.** The legacy output
  disagreed in 30.
- `filter-order.test.ts`: 8 pairs give identical Web CSS/JSX and Native
  diagnostics/styles/JSX in both orders. Web, Native static and the
  generated map through the real resolver all keep `brightness(150%)` for
  `brightness-50 brightness-150` in both orders.
- Rust: each function covers its register and not the shared declaration;
  `filter-none` and drop shadows stay out.
