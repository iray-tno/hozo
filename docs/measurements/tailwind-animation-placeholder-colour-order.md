# Animations and placeholder colours in Tailwind order

Continues #1230 above [coverage](tailwind-order-coverage.md). Policy
**scalar-order-v42**.

## What was wrong

- With the examples' own `@theme` colours added to the measured CSS (the
  `bg-brand` lists were the measurement's limit, not a barrier), the
  coverage script's real barriers were `animate-pulse` (two lists),
  `placeholder-slate-400`, `backdrop:` and `pt-[env(...)]`.
- `animate-*` and the `placeholder-*` colour utility had no ownership
  entry, so an input with one kept its whole class list in authored order.
- Native ran the **first** animation written under a condition, where CSS
  runs the last: `animate-spin animate-pulse` spun on Web and pulsed on
  Native in authored order.

## What changed

- `animation` joins `scalar_css_property` for the built-in animations
  (`animate-spin`, `-ping`, `-pulse`, `-bounce`, `-none`). A project's own
  `animate-<name>` and the `animation-*` longhands are not read yet.
- Native takes the last animation under each condition, and `animate-none`
  last means no hook.
- `placeholder-*` writes `color` on `::placeholder`. Ranking asks for the
  same `&::placeholder` selector `placeholder:` does, so the utility and the
  variant compare as Tailwind's rules do (the variant wins). Native's
  `placeholderTextColor` takes the last colour per scheme.
- `scripts/tailwind-order-coverage.mjs` adds the colour names of the
  examples' own `@theme` blocks to the measured CSS.

## Verification

- **Chromium, real Tailwind as the oracle**, both authored orders:
  - 5 animation inputs, with reduced motion off and on, reading
    `animation-name` and padding: **20 of 20 agree**; authored order
    disagreed in 10.
  - 4 placeholder-colour inputs on an `<input>`, light and dark, focused and
    not, reading padding and the `::placeholder` colour: **32 of 32
    agree**; authored order disagreed in 14.
- `animation-placeholder-colour-order.test.ts`: 7 inputs give identical Web
  CSS and identical Native output in both orders; authored order is
  order-sensitive for them; Native runs `spin` for `animate-spin
  animate-pulse` and not `pulse`; `placeholder:text-red-500` beats
  `placeholder-blue-500` on Native.
- Coverage: **318 of 320 inputs ranked (99.4%)**: 315 (98.4%) from the
  measurement fix alone, then 3 more.
