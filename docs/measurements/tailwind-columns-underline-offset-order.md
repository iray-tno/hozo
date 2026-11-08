# Columns and underline offsets in Tailwind order

Continues #1230 above [text alignment](tailwind-text-align-order.md). Policy
**scalar-order-v25**.

## What was wrong

`columns-*` and `underline-offset-*` had no ownership entry, so an input
with one kept its authored order on Web: `columns-3 columns-2` took `2`
where Tailwind's alphanumeric tiebreak puts `columns-3` last, and
`md:columns-1 columns-4` kept `4` at every width.

## What changed

Each is one declaration (`columns`, `text-underline-offset`) and joins
`scalar_css_property`. React Native has neither multi-column layout nor
text-decoration metrics, so both stay refused there exactly as before; the
gain is the Web cascade.

## Not covered

An arbitrary `columns-[10rem]` (or `cursor-[…]`) is a generic passthrough
write, not a `Columns` write, so an input with one still keeps its authored
order. The oracle shows it: `columns-[10rem] columns-3` disagrees with
Tailwind in all 4 observations, as the legacy output does. Ranking generic
passthrough writes is a separate change.

## Verification

- **Chromium, real Tailwind as the oracle**: 7 pairs (named, `auto`, a
  container width, `md:` and `hover:`) in both authored orders, 500px and
  1000px wide, LTR and RTL, reading computed `column-count`, `column-width`
  and `text-underline-offset`. **56 observations, 56 agree.** The legacy
  output disagreed in 20. The arbitrary pair above adds 8 observations, 4
  of which disagree before and after.
- `columns-underline-offset-order.test.ts`: 6 pairs on a `Text` give
  identical Web CSS and JSX, and identical Native diagnostics and styles, in
  both orders.
