# Skews and 3D rotations in Tailwind order

Continues #1230 above [conditional transform axes](conditional-transform-axes.md).
Policy **scalar-order-v27**.

## What was wrong

The skews and 3D rotations were left out of
[transform axis ordering](tailwind-transform-axis-order.md), so an input with
one kept its authored order: `skew-x-12 skew-x-6` took 6deg where Tailwind
emits `skew-x-12` last, and `rotate-x-12 rotate-x-45` likewise.

## What changed

Tailwind writes each of them as a register (`--tw-rotate-x`, `--tw-skew-y`,
…) read by one shared `transform` that every such rule also declares. Each
write owns its register, as the translate and scale axes do; `skew-*` is two
writes. `scale-3d` switches the scale declaration's form, owns no register
and stays a barrier. The unassessed neighbour in three existing tests moves
from `skew-x-12` to `translate-none`; `transform-gpu` was tried first and
emits no candidate group, so it cannot stand in for one.

## Verification

- **Chromium, real Tailwind as the oracle**: 10 pairs (same axis, bare
  against one axis, across functions, with `rotate`, negative, `md:`) in both
  authored orders, 500px and 1000px wide, LTR and RTL, reading computed
  `transform` and `rotate`. **80 observations, 80 agree.** The legacy output
  disagreed in 30.
- `skew-rotate-axis-order.test.ts`: 8 pairs give identical Web CSS/JSX and
  Native diagnostics/styles/JSX in both orders; Native static keeps
  `skewX: '12deg'` for both orders of `skew-x-6 skew-x-12`. The test first
  expected 6deg; the oracle showed Tailwind keeps 12deg, and the test was
  corrected to that.
