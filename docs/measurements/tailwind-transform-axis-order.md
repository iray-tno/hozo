# Rotation and the translate and scale axes in Tailwind order

Continues #1230 above [columns and underline offsets](tailwind-columns-underline-offset-order.md).
Policy **scalar-order-v26**. First layer in the registers/transforms domain.

## What was wrong

No transform write had an ownership entry, so an input with one kept its
authored order: `rotate-90 rotate-45` took 45deg where Tailwind's
alphanumeric tiebreak puts `rotate-90` last, and `translate-x-8 translate-4`
took 16px on the x axis where Tailwind keeps `translate-x-8`'s 32px.

## What changed

Tailwind 4 writes `rotate` directly. Each translate and scale axis writes its
own register (`--tw-translate-x`, `--tw-scale-y`, …), and every axis rule also
declares the shared `translate`/`scale` that reads them. Hozo already holds
each axis as its own write and joins them at emit time (`translate-4` is two
writes, `scale-50` three), so each axis owns its register and nothing else.
Owning the shared declaration would make `translate-4` ambiguous between its
own axes.

On Native the static output composes one `transform` in a fixed function
order, and the generated map composes the same slots at runtime through
`hozoTransformStyles`; ranking only decides which value each axis keeps.

Skews, 3D rotations and `scale-3d` compose into `transform` alongside other
registers and stay barriers. The unassessed neighbour in three existing
tests moves from `rotate-45` to `skew-x-12`.

## Not covered: a condition on one axis

`md:translate-x-8 translate-y-2` at md width gives `translate: 32px` where
Tailwind gives `32px 8px`, and `md:scale-x-50 scale-y-75` gives `0.5 1`
where Tailwind gives `0.5 0.75`: the conditional class emits the joined
declaration without the base axis. It disagrees identically before and after
this change, in both authored orders, so it is not an ordering result; it is
the next register layer.

## Verification

- **Chromium, real Tailwind as the oracle**: 15 pairs (same axis, bare
  against one axis, across families, `md:`) in both authored orders, 500px
  and 1000px wide, LTR and RTL, reading computed `rotate`, `scale` and
  `translate`. **116 of 120 agree**; the 4 that do not are the conditional
  axis above at 1000px. The legacy output disagreed in 46.
- `transform-axis-order.test.ts`: 12 pairs give identical Web CSS/JSX and
  Native diagnostics/styles/JSX in both orders. Native static keeps
  `translateX: 32`, `translateY: 16` for `translate-x-8 translate-4` and
  `rotate: '90deg'` for `rotate-90 rotate-45` in both orders, and the
  generated map through the real resolver and `hozoTransformStyles` gives
  the same.
- Rust: each axis covers its register and not `translate`/`scale`; skews and
  `Scale3d` stay out.
