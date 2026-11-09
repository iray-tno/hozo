# Grid, display keywords and position in Tailwind order

Continues #1230 above [coverage](tailwind-order-coverage.md): `grid`,
`fixed` and `row-span-2` were among the single-case barriers left in this
repository's corpus. Policy **scalar-order-v37**.

## What was wrong

`grid`, the display keywords other than `flex`/`hidden`/`contents`/`block`/
`inline-flex` (`inline-block`, `inline-grid`, `table`, ...), `fixed`,
`sticky`, `grid-cols-*`, `grid-rows-*`, `col-*` and `row-*` had no ownership
entry, so an input with one kept its authored order. `flex grid` was
`display: flex` where Tailwind gives `grid`; `p-4 p-2 grid` took 8px padding
where Tailwind takes 16px.

## What changed

Each of them is one declaration in Tailwind's rule, so each joins
`scalar_css_property` under its CSS property (`display`, `position`,
`grid-template-columns`, `grid-template-rows`, `grid-column`,
`grid-column-start`/`-end`, `grid-row`, `grid-row-start`/`-end`).

On Native nothing new is accepted: the display keywords other than `grid`,
and `fixed`/`sticky`, are refused as before. The grid wrapper reads the last
unconditional `display` and the last write of each track and placement
property, which is now the ranked winner. It combines a shorthand
(`col-span-2`) with an edge (`col-start-2`) by key, which agrees with
Tailwind emitting `grid-column` before `grid-column-start`.

## Verification

- **Chromium, real Tailwind as the oracle**, both authored orders, 500 and
  1000px wide, LTR and RTL:
  - 10 container inputs (`grid flex`, `hidden grid`, `inline-block block`,
    columns, rows, `fixed absolute`, `sticky relative`, `md:grid flex`,
    `p-2 p-4 grid`, `inline-grid table`), reading `display`, `position`,
    the two track properties and padding: **80 of 80 agree**; authored
    order disagreed in 38.
  - 8 item inputs inside a 3×3 grid (spans, starts, ends, `col-span-full`
    against `col-start-2`, padding beside `row-span-2`), reading the four
    resolved line properties and padding: **64 of 64 agree**; authored order
    disagreed in 32.
- `grid-position-order.test.ts`: 15 inputs give identical Web CSS and
  identical Native diagnostics, styles and JSX in both orders; the Native
  grid wrapper gets three columns from `grid-cols-3 grid-cols-2 flex grid`.
- `simple-projections.test.ts` no longer lists `fixed` and `inline-block`
  among the neighbours that keep authored order; `line-clamp-2` stands in.
- Coverage: **292 of 320 inputs ranked (91.3%)**, up from 288 (90%).
