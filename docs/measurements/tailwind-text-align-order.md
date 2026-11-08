# Every text alignment in Tailwind order

Continues #1230 above [blend modes](tailwind-blend-mode-order.md). Policy
**scalar-order-v24**.

## What was wrong

Only `text-left`, `text-center` and `text-right` had an ownership entry. An
input with `text-start`, `text-end` or `text-justify` kept its authored
order: `text-left text-justify` took `justify` where Tailwind's alphanumeric
tiebreak puts `text-left` last, and `md:text-justify text-right` kept
`right` at every width.

## What changed

All six write one `text-align` declaration and the same `textAlign` key on
Native, so every `TextAlign` joins `scalar_css_property`. Which values Native
accepts is unchanged.

## Verification

- **Chromium, real Tailwind as the oracle**: 7 pairs (including `md:` and
  `hover:`) in both authored orders, 500px and 1000px wide, LTR and RTL,
  reading computed `text-align`. **56 observations, 56 agree.** The legacy
  output disagreed in 20.
- `text-align-order.test.ts`: 5 pairs on a `Text` give identical Web CSS and
  JSX, and identical Native diagnostics, styles and JSX, in both orders. The
  generated Native map, run through the real resolver, gives
  `textAlign: 'left'` for `text-left text-justify` in both orders.
