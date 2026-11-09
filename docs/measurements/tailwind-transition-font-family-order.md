# Transitions and font families in Tailwind order

Continues #1230 above [coverage](tailwind-order-coverage.md), chosen because
the coverage script put them first among this repository's real barriers.
Policy **scalar-order-v34**.

## What was wrong

`transition`, `transition-colors`, `duration-*`, `ease-*`, `delay-*` and
`font-*` families had no ownership entry, so any input with one kept its
authored order. In this repository's own corpus `transition-colors` alone
kept 15 class lists on the old path, and `font-mono` 5; a padding conflict
beside a transition (`p-4 p-2 transition-colors`) took 8px where Tailwind
takes 16px.

## What changed

`transition-property`, `transition-duration`, `transition-delay`,
`transition-timing-function` and `font-family` join `scalar_css_property`,
each one declaration in Tailwind's rule (`duration-*` and `ease-*` also
declare their register, which no Hozo write owns). A utility's own duration
or easing still beats `transition`'s fallback by provenance in
`dedupe_last_wins`, as Tailwind's `var(--tw-duration, 0s)` does, whichever
is ranked later.

## Verification

- **Chromium, real Tailwind as the oracle**: 9 inputs (`transition` against
  `transition-colors`, durations, easings, delays, `transition-opacity`, font
  families, `md:` family) in both orders, 500/1000px, LTR/RTL, reading the
  computed transition properties and `font-family`. **72 of 72 agree.** The
  legacy output disagreed in 30.
- `transition-font-family-order.test.ts`: 8 inputs on a `Pressable` give
  identical Web and Native output in both orders; `p-4 p-2
  transition-colors` now emits 16px padding.
- Coverage: **268 of 320 inputs ranked (83.8%)**, up from 256 (80%). The
  next barrier under several of the freed inputs is `px-3` with
  `unassessed-condition` (8 inputs), which the transition had hidden.
