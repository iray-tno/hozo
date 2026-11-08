# Cursor and object fit in Tailwind order

Continues #1230 above [outlines](tailwind-outline-order.md). Policy
**scalar-order-v20**.

## What was wrong

`cursor-*` and the `object-*` fit utilities had no ownership entry, so an
input with one kept its authored order: `md:object-contain object-cover` kept
`cover` at every width, and `object-cover object-contain` took `contain` where
Tailwind's alphanumeric tiebreak puts `object-cover` last.

## What changed

Each is one declaration (`cursor`, `object-fit`) and, where React Native has
it, one key, so both join `scalar_css_property`. A cursor Native lacks is
refused there exactly as before; ranking does not change which writes Native
accepts.

## Verification

- **Chromium, real Tailwind as the oracle**: 7 pairs in both authored orders,
  500px and 1000px wide, LTR and RTL, reading computed `cursor` and
  `object-fit`. **56 observations, 56 agree.** The legacy output disagreed
  in 20.
- `cursor-object-fit-order.test.ts`: 5 pairs on an `Image` give identical Web
  CSS and Native static output in both orders. The generated Native map, run
  through the real resolver, gives `objectFit: 'cover'` for
  `object-cover object-contain` and `cursor: 'pointer'` for
  `cursor-pointer cursor-auto`, in both orders.
