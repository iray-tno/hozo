# Shadows and rings in Tailwind order

Continues #1230 above [conditional filter functions](conditional-filter-functions.md).
Policy **scalar-order-v29**.

## What was wrong

No shadow or ring write had an ownership entry, so an input with one kept its
authored order: `shadow-sm shadow-lg` took the large shadow where Tailwind
emits `shadow-sm` last, and `ring-4 ring-2` took 2px where Tailwind keeps 4px.

## What changed

Tailwind's `box-shadow` reads five layer registers (`--tw-inset-shadow`,
`--tw-inset-ring-shadow`, `--tw-ring-offset-shadow`, `--tw-ring-shadow`,
`--tw-shadow`), and the colours, the offset width and the inset flag are
registers too. Every shadow and ring rule also declares the shared
`box-shadow`. Each Hozo write owns its register: `BoxShadow` the shadow
layer, `RingWidth` the ring layer, `ShadowColor` the shadow colour, and so
on. `ring-offset-*` also writes `--tw-ring-offset-shadow`, which reads the
width; the width register is the one Hozo's write sets.

## How it was measured

Tailwind's computed `box-shadow` always lists all five layers, the unused
ones as `rgba(0, 0, 0, 0) 0px 0px 0px 0px`; Hozo writes only the layers in
use. That is spelling, not ordering, and without normalising it every
observation disagrees (16 of 16 for the first two pairs, before and after).
The oracle drops transparent zero layers from both sides before comparing.

## Verification

- **Chromium, real Tailwind as the oracle, normalised as above**: 12 inputs
  (layer against layer, colour against colour with and without `/50`, inset
  shadow and ring, offset width and colour, `ring-inset`, `md:`) in both
  authored orders, 500px and 1000px wide, LTR and RTL. **96 observations, 96
  agree.** The legacy output disagreed in 30.
- `shadow-ring-order.test.ts`: 10 inputs give identical Web CSS/JSX and
  Native diagnostics/styles/JSX in both orders; Web, Native static and the
  generated map through the real resolver keep `shadow-sm`'s
  `0 1px 3px 0` for `shadow-sm shadow-lg` in both orders.
- Rust: each write covers its register and not `box-shadow`; the offset
  width does not cover the offset shadow.
