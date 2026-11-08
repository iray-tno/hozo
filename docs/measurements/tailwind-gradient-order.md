# Gradients in Tailwind order

Continues #1230 above [conditional shadow layers](conditional-shadow-layers.md).
Policy **scalar-order-v30**.

## What was wrong

No gradient write had an ownership entry, so an input with one kept its
authored order: `bg-linear-to-r from-red-500 from-blue-500` started blue,
where Tailwind emits `from-red-500` last and starts red; `bg-radial` against
`bg-linear-to-r` and `bg-none` against a constructor likewise.

Adding the entries was not enough. `bg-linear-*`'s rule re-declares
`--tw-gradient-position` inside `@supports (background-image:
linear-gradient(in lab, red, red))`, and the assessment read any at-rule
beside declarations as a branching rule (`branching-rule`). After that was
allowed, the candidate plan still reported `unassessed-scalar-owner`:
`same_queries` walked into the `@supports` as a condition wrapper that the
write's own condition did not ask for.

## What changed

- A constructor, `bg-none` and an image own `background-image`, which each
  declares itself. Each stop colour and position owns its register
  (`--tw-gradient-from`, `--tw-gradient-via-position`, …).
- `supports_refinement`: an `@supports` that only re-declares, with the same
  importance, properties its siblings already declare is neither a branch
  nor a condition wrapper. It picks which value a browser uses, not which
  properties the rule writes, under which condition, or how much it weighs.
  A new property, a different importance, an empty block, a nested rule or
  any other at-rule is still a branch. Colour opacity modifiers
  (`bg-red-500/50`) were checked: their rules have no `@supports` in this
  snapshot and were already ranked, so nothing else moves.

## Not covered

`md:bg-linear-to-b bg-linear-to-r from-red-500` at md: Hozo keeps `to
right`, Tailwind goes `to bottom`, in both authored orders. The md rule has a
constructor and no stops, and Hozo joins the gradient per condition, the
composition defect already fixed for transforms, filters and shadows.

## Verification

- **Chromium, real Tailwind as the oracle**: 9 inputs (stop colour against
  stop colour for each stop, position against position, constructor
  against constructor, `bg-none`, three stops, `md:` constructor) in both
  authored orders, 500px and 1000px wide, LTR and RTL, reading computed
  `background-image`. **68 of 72 agree**; the 4 that do not are the `md:`
  input above. The legacy output disagreed in 32.
- Colour opacity control: `bg-red-500/50`, `text-red-500/50`,
  `border-red-500/50` and a `md:` pair, both orders: 32 of 32 agree.
- `gradient-order.test.ts`: 7 inputs give identical Web CSS/JSX and Native
  diagnostics/styles/JSX in both orders.
- Rust: `supports_refinement` accepts the re-declaration and rejects a new
  property, a different importance, an empty block, a nested rule and
  `@media`.
