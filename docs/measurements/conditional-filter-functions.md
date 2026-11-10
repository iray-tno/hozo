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
- The historical literal backdrop chain sorted `opacity` last. The follow-up
  below closes that separate ordering defect.

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

## Literal backdrop follow-up

Literal and split-condition output now share `filter_slot` rather than letting
the literal chain use the enum's different opacity position. Both Safari's
prefixed declaration and the unprefixed declaration read opacity before
saturate and sepia. This reuses an existing build-time comparator; it adds no
device code, property registrations or output bytes beyond reordering the same
functions. Native backdrop support is unchanged.

`backdrop-literal-order.test.ts` derives the selected function order from the
actual installed Tailwind register reader and compares both authored orders.
The compiler regression also checks a single hover condition and both CSS
prefixes; the Rust unit checks forward/reverse properties. On Windows with CPU
1 / Idle / serial: 222 Web Rust tests, four compiler filter tests and the one
independent Tailwind-reader test pass, with a rebuilt addon. Scoped all-target
Clippy, rustfmt and the pinned Native text fixture check pass. No new browser
pixel, Native backdrop, global conformance or device-performance result is
claimed; the historical browser receipt above is not relabelled as a new run.
