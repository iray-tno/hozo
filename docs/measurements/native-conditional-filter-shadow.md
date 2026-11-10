# Native filters and shadows under a condition

Part of #1230, registers domain, the Native half of
[conditional filter functions](conditional-filter-functions.md) and
[conditional shadow layers](conditional-shadow-layers.md). Not an ordering
policy change.

## What was wrong

Each condition's Native style object carries one whole `filter` string and
one whole `boxShadow` string, and RN lets the later object in the style
array replace the earlier one. Tailwind keeps every function and layer in a
register, so:

- `md:blur-sm grayscale`: Tailwind `blur(8px) grayscale(100%)` at md; Native
  `blur(8px)`.
- `focus:ring-2 shadow-sm`: Tailwind keeps the shadow under the ring while
  focused; Native drew the ring alone.
- `md:shadow-red-500 shadow-lg`: at md the colour alone, which paints no
  shadow.

## What changed

`fold_base_layers` (`crates/hozo_native/src/style.rs`) copies the
unconditional shadow-family and filter-family writes into every other
condition that writes the same family, before that condition's own writes.
The existing per-group composition then joins them, and a condition's own
function or layer still wins (`md:blur-lg blur-sm` is 16px at md).

An unconditional style is active whenever a conditional one is, so this is
exactly Tailwind's result whenever one condition touches the family.

## Not covered

Two conditions that both touch the shadow or gradient family and are active
together still lose each other's part: each object carries the base, but the
later one replaces the earlier. A later layer adds a
[scoped runtime composer for ordinary conditional filter functions](native-conditional-filter-slots.md).
Drop-shadow size/colour and filter animation endpoints remain outside that
repair. The older base-folding path remains for those boundaries.

## Verification

- `native-conditional-layers.test.ts` executes the compiled style expression
  with md off and on: `md:blur-sm grayscale` gives `grayscale(100%)` and
  `blur(8px) grayscale(100%)`; `md:ring-2 shadow-sm` keeps `0 1px 3px 0`
  beside the ring at md; `md:shadow-red-500 shadow-lg` repaints the large
  shadow at md; `md:blur-lg blur-sm` still gives 16px at md.
- Compiler 496, tailwind 209, `@hozo/ui` 86, `@hozo/patterns` 165,
  native-showcase 240 and tailwind-conformance 972 pass unchanged.

## Gradients

A later layer adds the gradient family to the same fold: constructors,
`bg-none`, images and stop colours and positions. On Native each condition's
style object carried one whole `backgroundImage`, so
`md:bg-linear-to-b bg-linear-to-r from-red-500` was a stop-less
`linear-gradient(to bottom)` at md, and `md:from-blue-500 bg-linear-to-r
from-red-500` a colour with no constructor. Folding the base in gives
`to bottom` with the red stop, and `to right` with the blue stop; a
conditional `bg-none` still wins.

`native-conditional-layers.test.ts` executes those three inputs with md off
and on.
