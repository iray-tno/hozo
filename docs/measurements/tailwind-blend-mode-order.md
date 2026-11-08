# Blend modes in Tailwind order

Continues #1230 above [overflow](tailwind-overflow-order.md). Policy
**scalar-order-v23**.

## What was wrong

`mix-blend-*` and `bg-blend-*` had no ownership entry, so an input with one
kept its authored order: `mix-blend-screen mix-blend-multiply` took
`multiply` where Tailwind's alphanumeric tiebreak puts `mix-blend-screen`
last, and `md:mix-blend-normal mix-blend-overlay` kept `overlay` at every
width.

## What changed

Each is one declaration (`mix-blend-mode`, `background-blend-mode`) and joins
`scalar_css_property`. On Native `mix-blend-*` is one `mixBlendMode` key;
`mix-blend-plus-darker` and every `bg-blend-*` are refused there exactly as
before.

## Verification

- **Chromium, real Tailwind as the oracle**: 6 pairs (including `md:` and
  `hover:`) in both authored orders, 500px and 1000px wide, LTR and RTL,
  reading computed `mix-blend-mode` and `background-blend-mode`.
  **48 observations, 48 agree.** The legacy output disagreed in 16.
- `blend-mode-order.test.ts`: 4 pairs give identical Web CSS and JSX, and
  identical Native diagnostics and styles, in both orders. The generated
  Native map, run through the real resolver, gives `mixBlendMode: 'screen'`
  for `mix-blend-multiply mix-blend-screen` in both orders.
