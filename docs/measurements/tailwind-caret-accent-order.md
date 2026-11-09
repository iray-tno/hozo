# Caret and accent colours in Tailwind order

Continues #1230 above [coverage](tailwind-order-coverage.md), where
`accent-emerald-600` held a class list of this repository on the old path.
Policy **scalar-order-v41**.

## What was wrong

- `caret-*` and `accent-*` had no ownership entry, so an input with one kept
  its whole class list in authored order: `p-4 p-2 caret-red-500` took 8px
  padding where Tailwind takes 16px.
- Native's `cursorColor` took the **first** caret colour written, where CSS
  takes the last, and ignored the write's condition: `focus:caret-red-500
  caret-blue-500` was a red caret in every state, and `dark:caret-red-500
  caret-blue-500` red in light mode too.

## What changed

- `caret-color` and `accent-color` join `scalar_css_property`, one
  declaration each.
- Native's `cursorColor` reads the last unconditional caret colour and the
  last `dark:` one, through the same per-scheme helper as
  `placeholderTextColor` (`__hozoDark ? dark : light`). Any other condition
  is diagnosed as not wired, as a conditional placeholder colour already is,
  instead of being applied to every state.
- `accent-*` is refused on Native, whichever wins, as before.

## Verification

- **Chromium, real Tailwind as the oracle**, on an `<input>` in light and
  dark schemes, focused and not, reading padding, margin, `caret-color` and
  `accent-color`: 6 inputs in both orders, **48 of 48 agree**; authored order
  disagreed in 22.
- `caret-accent-order.test.ts`: 5 inputs give identical Web CSS and
  identical Native diagnostics, styles and JSX in both orders; authored order
  is order-sensitive for them; `caret-red-500 caret-blue-500` gives Native
  Tailwind's red; `dark:` gives `__hozoDark ? red : blue`; `focus:` is
  diagnosed and the field keeps the unconditional blue.
- Coverage: **309 of 320 inputs ranked (96.6%)**, up from 308 (96.3%).
