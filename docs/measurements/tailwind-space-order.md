# Space utilities in Tailwind order

Continues #1230 above [coverage](tailwind-order-coverage.md), where
`space-y-*` held eight class lists of this repository on the old path, the
largest barrier left. Policy **scalar-order-v40**.

## What was wrong

Tailwind's `space-y-2` is `:where(.space-y-2 > :not(:last-child)) { … }`,
a rule on the element's children. The assessment read no such selector, so
any input with a space utility kept its whole class list in authored order:
`p-4 p-2 space-y-2` took 8px padding where Tailwind takes 16px, and
`space-y-4 space-y-2` took the 8px gap where Tailwind takes 16px.

## What changed

- `:where(& > :not(:last-child))` is read as the children's scope, not a
  condition. Everything in it is inside `:where()`, the class too, so a rule
  in that scope weighs `[0, 0, 0]`.
- A `space-x`/`space-y` write is owned **only** by a children-scoped rule
  (its `margin-inline-start`/`margin-block-start`), and an element write
  never by one. Ranking so decides which gap the parent passes on; both
  backends then put a child's own margin above it, as before.
- A state or selector variant on a children-scoped rule
  (`hover:space-y-4` is `:where(.x:hover > …)`) also weighs nothing in
  Tailwind, unlike the same variant on the element, so such a rule is not
  read and its input keeps authored order. Queries (`md:`) are read.
- `space-*-reverse` and `divide-*` are not yet read.

## Verification

- **Chromium, real Tailwind as the oracle**: 6 inputs (two gaps, two axes,
  a gap beside a padding conflict, `md:` against two plain gaps, a gap beside
  the element's own margin conflict) in both orders, 500/1000px, LTR/RTL,
  reading padding, the element's margin and the first two children's four
  margins: **48 of 48 agree**; authored order disagreed in 24.
- `space-order.test.ts`: 5 inputs give identical Web CSS and identical
  Native diagnostics, styles and JSX in both orders; authored order is
  order-sensitive for them; Native's ranked `space-y-4 space-y-2` equals
  `space-y-4`; a child's `mt-8` still wins over the gap on both backends;
  `hover:space-y-4` keeps authored order.
- `order-barrier.test.ts` reports `hover:space-y-2` as its
  unassessed-selector example.
- Coverage: **308 of 320 inputs ranked (96.3%)**, up from 300 (93.8%).
