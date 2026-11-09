# Relative leading and tracking in Tailwind order

Continues #1230, compound typography, above the
[known gaps index](tailwind-known-gaps.md). Policy **scalar-order-v31**.

## What was wrong

Ratio leading (`leading-tight`, `leading-[1.5]`) and em tracking
(`tracking-wide`) had no ownership entry, so an input with one kept its
authored order: `leading-tight leading-loose` took the loose line where
Tailwind keeps `leading-tight`, and `tracking-wide tracking-tight` took the
tight one.

They were held back because Native has no unitless line height or em letter
spacing: `fold_font_relative` turns them into pixels against the font size.
That fold runs after ordering and does not change with it, so ranking decides
which leading or tracking wins and the fold sizes the winner exactly as it
sized the authored-last one before.

## What changed

`LineHeight::Ratio` joins `line-height` and `LetterSpacing::Em` joins
`letter-spacing` in `scalar_css_property`. A text size's own line height
keeps its fallback provenance, so an explicit `leading-*` still beats it.
`tracking-wide` leaves the unassessed-neighbour list in
`simple-projections.test.ts`; `tracking-[1em]` and `leading-[1em]`, em
*lengths* rather than a ratio or an `Em`, stay there as barriers.

## Not covered

- The generated Native map refuses ratio leading and em tracking
  (`no-native-output`) before and after: a runtime class string has no font
  size to multiply by there. Listed in the gaps index.
- Arbitrary em lengths, as above.

## Verification

- **Chromium, real Tailwind as the oracle**: 10 inputs (ratio against ratio,
  ratio against absolute, with a text size, arbitrary ratio, em against em
  and against px, `md:` leading, responsive text size) in both authored
  orders, 500px and 1000px wide, LTR and RTL, reading computed
  `line-height` and `letter-spacing`. **80 observations, 80 agree.** The
  legacy output disagreed in 34.
- `relative-text-order.test.ts`: 8 inputs on a `Text` give identical Web and
  Native output in both orders; for `text-lg` with `leading-tight` and
  `leading-loose` in either order, Native's `lineHeight` equals its
  `fontSize` times the ratio Web keeps.
