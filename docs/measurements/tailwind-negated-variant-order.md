# Negated variants in Tailwind order

Domain 5 of the [inventory](tailwind-order-inventory.md), which counted 23
named variants Native lowers whose inputs kept authored order, 19 of them a
`not-*` form. Policy **scalar-order-v45**.

## What was wrong

The assessment read negation only around the boolean ARIA states. Tailwind
writes the others in two shapes, neither of which it read:

- around a selector, `&:not(*<x>)`: `not-focus:`, `not-active:`,
  `not-focus-visible:`, `not-disabled:`, `not-empty:`, `not-enabled:`,
  `not-ltr:`, `not-rtl:` and the rest;
- around a media query, `@media not <query>`: `not-sm:` and the other
  widths, `not-dark:`, `not-motion-safe:`, `not-portrait:`,
  `not-contrast-more:` and the rest.

## What changed

- The negated interaction states are owner facts of their own, after the
  ARIA facts (`not-focus:` is not `focus:` with a different rank). Native
  delivers them through the guards it already had.
- `&:not(*<x>)` weighs what its argument does: one for `*:empty`, none for
  `*:where(:dir(ltr), …)`. `Condition::Not` around a selector asks for that
  selector.
- `Query::Not` matches `@media not <query>` against the inner query, so
  `not-sm:` asks for `not (width >= …)` as `sm:` asks for `(width >= …)`.
- `not-hover:` stays a barrier: Tailwind writes it as two sibling rules (the
  selector and `@media not (hover: hover)`). `*:`, `**:` and `starting:` are
  the other three gaps left.

## Verification

- **Chromium, real Tailwind as the oracle**: 9 inputs in both orders,
  500/1000px, LTR/RTL, light/dark (with reduced motion in dark), focused and
  not, reading padding: **288 of 288 agree**; authored order disagreed in
  72. `not-enabled:` and `not-disabled:` are left out of the browser run: a
  Web `Pressable` is a `div` that Hozo marks disabled with
  `data-hozo-disabled`, which `:enabled` never matches, an output difference
  that does not depend on order.
- `negated-variant-order.test.ts`: 12 inputs, those two included, give
  identical Web CSS and Native output in both orders; authored order is
  order-sensitive for them; `not-hover:` keeps authored order.
- Metro's Chip test pinned `hovered && …` before `!(focused) && …`; with the
  input ranked they follow Tailwind's variant order, `not-focus:` first. The
  two write different properties, so the result is the same.
- Inventory, domain 5: **4 gaps** (from 23). Repository coverage unchanged
  at 318/320.
