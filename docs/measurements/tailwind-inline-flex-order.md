# Inline-flex in Tailwind order

Continues #1230 above [cursor and object fit](tailwind-cursor-object-fit-order.md).
Policy **scalar-order-v21**.

## What was wrong

`inline-flex` was deliberately left out of the display domain when the other
direct projections graduated, because of its contextual Native behaviour. An
input with it kept its authored order: `md:hidden inline-flex` showed the
item at `md`, and `inline-flex flex` let `flex` win where Tailwind's
alphanumeric tiebreak puts `inline-flex` last.

## What changed

`Display(InlineFlex)` joins the `display` arm of `scalar_css_property`. On
Native it is `display: 'flex'`; `lower_inline_flex` (render time, after the
parser has ordered the input) adds `alignSelf: 'flex-start'` only when no
`self-*` is authored and no later display in the same condition replaces it.
Because ordering now runs first, "later" means Tailwind's order, not the
author's, so `inline-flex flex` and `flex inline-flex` both keep the synthetic
alignment.

Not changed, and pinned by the test rather than hidden: the generated Native
map never synthesizes that `alignSelf`. Static output and the map agree on
`display` and on an authored `self-*`; for a bare `inline-flex` they differ on
`alignSelf` exactly as before. A `md:inline-flex` beside a base `self-*` still
keeps the author's `self-*` at every width (no synthetic write at all).

## Verification

- **Chromium, real Tailwind as the oracle**: 8 pairs in both authored orders,
  500px and 1000px wide, LTR and RTL, reading computed `display` and
  `align-self`. **64 observations, 64 agree.** The legacy output disagreed
  in 12.
- `inline-flex-order.test.ts`: 7 pairs give identical Web CSS and Native
  static output in both orders. Seven class lists through the generated
  Native map give the same `display` as static Native; where `alignSelf`
  differs, it is only the static synthetic `flex-start`.
- `simple-projections.test.ts` used `inline-flex` as an unassessed neighbour;
  it now uses `inline-block`.
