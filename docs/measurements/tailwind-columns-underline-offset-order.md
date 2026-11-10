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

The original arbitrary `columns-[10rem]` gap is closed by the follow-up below.
Opaque variables/two-value column shorthands and `cursor-[…]` remain generic
passthrough writes. This does not rank every arbitrary property by its name.

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

## Readable arbitrary column follow-up

Policy **scalar-order-v57** gives positive arbitrary integer counts, readable
lengths and `auto` the same `Columns` IR ownership as named utilities. Rem/em
units and CSS math are preserved, not folded into default-font pixels. Unknown
variables, hints, zero counts and two-value shorthands keep their raw path.
Native still refuses multi-column layout; there is no camelCase guess or new
Native layout engine.

The new Tailwind test compares four pairs in both authored orders against the
installed engine's class order and actual `columns` declaration. Captured and
built-in Web compilation agree; Native still diagnoses and emits no column
style. Its corrected pre-fix run fails on the two arbitrary widths, and passes
after the parser change. A first harness attempt omitted the theme for a named
container width; the independent probe now uses a theme-independent count.

Existing barrier/old-sort negative controls use `columns-(--layout)` instead of
pretending the newly supported length is still opaque. Forward/reverse inputs
still differ there. No barrier assertion was removed or silently made vacuous.
The policy identifier and pinned fixture hashes change to prevent old prepared
output being confused with the expanded ownership domain. No resolver or app
runtime code is added; no new browser/device measurement or global completion
claim follows from this declaration-level regression.
