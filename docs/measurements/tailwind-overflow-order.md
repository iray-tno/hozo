# Overflow and its axes in Tailwind order

Continues #1230 above [inline-flex](tailwind-inline-flex-order.md). Policy
**scalar-order-v22**.

## What was wrong

Only `overflow-visible`, `overflow-hidden` and `overflow-scroll` had an
ownership entry. `overflow-auto`, `overflow-clip` and every
`overflow-x-*`/`overflow-y-*` kept the whole input in authored order, so on
Web `overflow-x-auto overflow-hidden` left the x axis `hidden`, where
Tailwind emits `overflow-x` after `overflow` and keeps it `auto`; and
`overflow-x-scroll overflow-x-hidden` took `hidden` where Tailwind's
alphanumeric tiebreak puts `overflow-x-scroll` last.

## What changed

Every `overflow`, `overflow-x` and `overflow-y` write is one declaration and
joins `scalar_css_property`. React Native has one `overflow` key with no
`auto` or `clip`, so those values and both axes are refused there exactly as
before, as a cursor Native lacks is; ranking does not change which writes
Native accepts. The gain is the Web cascade.

## Verification

- **Chromium, real Tailwind as the oracle**: 9 pairs (shorthand against axis,
  axis against axis, `auto` against `clip`, under `md:` and `hover:`) in both
  authored orders, 500px and 1000px wide, LTR and RTL, reading computed
  `overflow-x` and `overflow-y`. **72 observations, 72 agree.** The legacy
  output disagreed in 30.
- `overflow-order.test.ts`: 7 pairs give identical Web CSS and JSX, and
  identical Native diagnostics and styles, in both orders; for
  `overflow-x-auto overflow-hidden` the emitted CSS puts the axis after the
  shorthand.
- `simple-projections.test.ts` no longer lists `overflow-clip` among the
  unassessed neighbours; `fixed` and the others remain.
