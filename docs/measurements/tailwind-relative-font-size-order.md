# Relative text sizes in Tailwind order

Continues #1230, compound typography, above
[text slash sizes](tailwind-text-slash-order.md). Policy
**scalar-order-v33**.

## What was wrong

Only absolute text sizes had an ownership entry, so an input with an em
size kept its authored order: `text-[2em] text-sm` drew 14px where Tailwind
emits the arbitrary size later and draws 2em (32px in the oracle).

## What changed

Every `FontSize` write joins `font-size` in `scalar_css_property`. Native's
relative folds (`fold_font_relative`, the semantic ratios) read only pixel
sizes and run after ordering; ranking an em size decides which size wins
without changing what they read.

## Not covered

`text-[150%]` and `text-[length:var(--x)]` are generic passthrough writes,
not `FontSize`; their inputs keep authored order (8 of 48 observations in the
probe below, before and after). Listed with the passthrough barrier in the
[gaps index](tailwind-known-gaps.md).

## Verification

- **Chromium, real Tailwind as the oracle**: 6 inputs (em against a named
  size, em against em, `md:` em, rem, percent, `length:` var) in both
  orders, 500/1000px, LTR/RTL, reading computed `font-size`. **40 of 48
  agree**; the 8 that do not are the two passthrough inputs above. The
  legacy output disagreed in 22.
- `relative-font-size-order.test.ts`: 4 inputs on a `Text` give identical
  Web and Native output in both orders; `text-[2em] text-sm` emits
  `font-size: 2em` after `14px`.
