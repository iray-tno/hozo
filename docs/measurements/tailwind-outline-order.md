# Outlines in Tailwind order

Continues #1230 above [the flex shorthand](tailwind-flex-shorthand-order.md).
Policy **scalar-order-v19**.

## What was wrong

Outline widths, colours and offsets had no ownership entry, so an input with
one kept its authored order: `focus:outline-4 outline-2` kept 2px when
focused, and `md:outline-blue-500 outline-red-500` kept red at every width.

## What changed

`outline-width`, `outline-color` and `outline-offset` are one declaration
each, and one Native key each, so they join `scalar_css_property`. Like a
[border width](tailwind-border-width-order.md), an outline width rule also
writes `outline-style: var(--tw-outline-style)`, which Hozo lowers to a
literal `solid`; that write is ranked with its width. A style utility
(`outline-dashed`, `outline-none`) declares `--tw-outline-style`, so its
style write is unowned for the same reason a border style utility's is; the
register check (`register_bound`) now covers both. `outline-none` is also
`outlineWidth: 0` on Native, a width key, so `OutlineStyle(None)` stays out of
the domain whatever its rule.

Widths and offsets in font-relative units stay out, as `font-size` does.

## Verification

- **Chromium, real Tailwind as the oracle**: 9 pairs in both authored orders,
  500px and 1000px wide, LTR and RTL, reading computed `outline-width`,
  `outline-style`, `outline-color` and `outline-offset`. **72 observations,
  72 agree.** The legacy output disagreed in 20.
- `outline-order.test.ts`: 7 pairs give identical Web CSS and Native static
  output in both orders; `outline-dashed focus:outline-2` and
  `outline-none focus:outline-2` still differ by order (barriers kept); the
  generated Native map, run through the real resolver, gives 2px red at rest
  and 4px blue focused for the same four classes in two orders.
