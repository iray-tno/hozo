# Border widths in Tailwind order

Continues #1230 above [border colours](tailwind-border-color-order.md). Policy
**scalar-order-v17**.

## What was wrong

Border widths had no ownership entry, so an input with one kept its authored
order. `md:border-4 border-2` kept 2px at every width, and
`border-t-4 border-2` let `border-2` overwrite the top edge where Tailwind
keeps 4px.

## What changed

Every Tailwind width rule writes two declarations:

```css
.border-t-4 {
  border-top-style: var(--tw-border-style);
  border-top-width: 4px;
}
```

Hozo lowers that to a width write and a literal `solid` style write. Both now
join the ordering domain (`border_edge_properties`): a side's width is owned
by `border-width` or that side's longhand, a logical edge's by its own
longhand, and the style the same way. Widths in font-relative units fold
through the font size and stay out, as `font-size` does.

A style utility is different:

```css
.border-dashed {
  --tw-border-style: dashed;
  border-style: dashed;
}
```

Wherever it applies, every width rule's `var(--tw-border-style)` reads
`dashed` too, so the result does not depend on the two rules' order. Hozo's
literal `solid` would, so ranking it would let `md:border-2` turn
`border-dashed` solid at `md`. A style write from a rule that declares
`--tw-border-style` is therefore unowned (`register-bound-property`), and an
input with a style utility keeps its authored order, as before.

On Native, as with [logical edges](tailwind-logical-property-order.md),
different keys are chosen by key, not order, so ranking settles only writes to
the same key: `border-t-4 border-2` both write `borderTopWidth`. Native has a single `borderStyle`, which every width
writes as `solid`.

## Verification

- **Chromium, real Tailwind as the oracle**: 14 pairs in both authored orders,
  500px and 1000px wide, LTR and RTL, reading all four computed side widths.
  **112 observations, 112 agree.** The legacy output disagreed in 34.
- The same oracle reading all four side styles, for 7 pairs whose every side
  has a width: **56 of 56 agree** (legacy 18 disagree). A side with no width
  differs from upstream (Hozo's view reset writes `border: 0 solid`, upstream
  without preflight computes `none`); it draws nothing either way and is not
  an ordering difference.
- `border-width-order.test.ts`: 10 pairs give identical Web CSS and Native
  static output in both orders; `border-dashed md:border-2` still differs by
  order; the generated Native map, run through the real resolver, gives
  `border-2 border-t-4` and `border-y-2 border-t-4` a 4px top, and
  `hover:border-4 border-2` 2px at rest and 4px hovered, in both orders.

## Not changed

Border style utilities (`border-dashed`, `border-solid`, `border-none`) and
the other `--tw-*` registers (shadow, ring, transform).
