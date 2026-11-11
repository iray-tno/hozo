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
so both originally stayed barriers. Native accepts `filter` and refuses `backdrop-*`
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
- Rust: each function covers its register and not the shared declaration.

## Whole-property resets

Policy **scalar-order-v58**. Tailwind 4.3.3 emits `filter-none` and
`backdrop-filter-none` even though its completion list omits them. Their
rules own the shared declaration, not any function register. Built-in
descriptors now probe both through Tailwind, and the captured and built-in
plans both rank them. Native continues to refuse `backdrop-filter-none`.

- With both hover and active engaged, Chromium with real Tailwind 4.3.3,
  Chromium with Hozo Web output, the generated Native static callback, and
  the generated Native class resolver all picked 8px for
  `active:p-2 hover:p-4 filter-none` in either authored order. Before the
  change, the static Hozo paths picked 16px in the order shown. Both
  no-reset controls still pick 8px in all four paths.
- Regression tests exercise the rank in both contexts, whole-declaration
  reset versus blur in both authored orders, and a real uncaptured colour
  that still sends the Native string down the authored path.
- No new ordering mechanism. Web's register projection is covered
  separately below; genuine Native fallback parity is outside this receipt.

### Web register revival

`blur-sm filter-none hover:sepia` is off at rest. While hovered, it
restores the base blur and adds sepia; on leaving, it turns off again.
Previously the whole-property reset disabled register splitting for the
static owner, so the later condition could only apply sepia on its own.
The reset still writes `filter: none`, but no longer suppresses the
register writes. The backdrop family has the same behavior on Web.

In Chromium, Tailwind 4.3.3 and all three Hozo Web routes (built-in,
captured, and the upstream-ordered candidate sheet) produced
`none → blur(8px) sepia(1) → none` for both families in both input
orders. Standalone resets, same-axis replacements and opaque/drop-shadow
boundaries keep their earlier output shape. Native filter composition
was unchanged; backdrop support on Native was not extended.
