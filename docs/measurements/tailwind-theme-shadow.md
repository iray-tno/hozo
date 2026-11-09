# Theme shadow tokens

Continues #1230 above [guarded classes](tailwind-guarded-class-order.md),
found by the coverage script: `shadow-hozo-surface` was the largest
`unmapped-property` barrier left (6 class lists). Looking at why showed a
rendering bug, not only an ordering one. Policy **scalar-order-v36**.

## What was wrong

Tailwind reads `shadow-<name>` as a shadow when the theme has
`--shadow-<name>`, and only otherwise as a colour. Hozo's parser has no
theme and reads every non-scale `shadow-<name>` as a colour. `@hozo/ui`
defines both `--color-hozo-surface` and `--shadow-hozo-surface:
var(--shadow-sm)`, so `shadow-hozo-surface` -- on its Card, BottomSheet,
Calendar and CodeBlock -- compiled to a shadow colour with no shadow to
paint: an empty rule on Web (`.hozo-0 { }`) and an empty style object on
Native. Those components drew no shadow at all.

For ordering, the colour write was checked against Tailwind's size rule,
which declares `--tw-shadow`, not `--tw-shadow-color`: `unmapped-property`,
and the whole class list kept authored order.

## What changed

- `@hozo/tailwind`'s theme loader reads `--shadow-*`, following each `var()`
  chain to a value; the theme carries them (`Theme::shadow`).
- `Theme::resolve_shadow_tokens` turns a `shadow-<name>` colour write into
  that box shadow when the theme names one. Both backends call it before
  their last-wins pass (Web `push_rules_using`, Native condition groups) and
  in both runtime candidate paths, so a theme shadow and `shadow-lg` in one
  class list still replace each other.
- Ownership: a `shadow-<name>` token write is owned by the rule's
  `--tw-shadow` or `--tw-shadow-color`, whichever Tailwind's rule declares.
  Tailwind has already resolved which it is; a rule declaring both stays a
  barrier.

## Not covered

`shadow-hozo-surface shadow-red-500`: Tailwind keeps the shadow black,
because the theme value is `var(--shadow-sm)` and Tailwind cannot open it to
insert `--tw-shadow-color`. Hozo follows the chain and repaints it red. Rare
(a colour on a theme shadow token); listed in the
[gaps index](tailwind-known-gaps.md).

## Verification

- `theme-shadow.test.ts`, with `@hozo/ui`'s theme loaded:
  `shadow-hozo-surface` writes `box-shadow: 0 1px 3px 0 …` on Web and
  `boxShadow: '0 1px 3px 0 …'` on Native; `shadow-hozo-accent` (a colour
  only) still repaints `shadow-lg`; `shadow-hozo-surface shadow-lg` and
  `p-4 p-2 shadow-hozo-surface` give the same Web and Native output in both
  orders.
- **Chromium, real Tailwind as the oracle**, with the theme loaded and the
  oracle's transparent-layer normalisation: 4 inputs in both orders,
  500/1000px, LTR/RTL: **24 of 32 agree**; the 8 that do not are the colour
  case above.
- Coverage: **288 of 320 inputs ranked (90%)**, up from 283 (88.4%).
- `@hozo/ui` 86 and `@hozo/patterns` 165 pass.
