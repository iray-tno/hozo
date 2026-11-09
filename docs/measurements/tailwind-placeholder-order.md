# Placeholder colours and resize in Tailwind order

Continues #1230 above [coverage](tailwind-order-coverage.md), where
`placeholder:text-hozo-text-subtle` held four class lists of this
repository on the old path. Policy **scalar-order-v39**.

## What was wrong

`&::placeholder` was not one of the selector shapes the assessment reads,
so `placeholder:` was an unassessed selector and an input with one kept its
whole class list in authored order: `p-4 p-2 placeholder:text-red-500` took
8px padding where Tailwind takes 16px. Under three of those lists the next
barrier was `resize-none`, which had no ownership entry.

## What changed

- `&::placeholder` is read as a condition on the element, weighing one
  type (`[0, 1, 1]` for `placeholder:text-red-500`), and
  `Condition::PseudoElement(Placeholder)` asks for exactly that selector.
  Native carries a placeholder colour as `TextInput`'s
  `placeholderTextColor`, which takes the last colour written in each
  scheme, so the ranked winner is the one it sees. No other pseudo-element
  is read: `::backdrop` becomes a Native slot's unconditional style and
  needs its own proof, and `::before`/`::after` and the rest stay
  unassessed.
- `resize-*` is one `resize` declaration. Native has no resize handle:
  `resize-none` writes nothing there and the others are refused, whichever
  wins, as before.
- `placeholder-*` (the colour utility, an unconditional Hozo write whose
  rule has the `::placeholder` selector) is still unmapped.

## Verification

- **Chromium, real Tailwind as the oracle**, on an `<input>` in light and
  dark schemes, focused and not, reading padding, colour and the
  `::placeholder` colour: 7 placeholder inputs in both orders, **56 of 56
  agree**; authored order disagreed in 22. 3 resize inputs, also reading
  `resize`: **24 of 24 agree**; authored order disagreed in 16.
- `placeholder-order.test.ts`: 5 placeholder inputs and 2 resize inputs give
  identical Web CSS and identical Native diagnostics and styles (and JSX,
  with the `placeholderTextColor` prop) in both orders; authored order is
  order-sensitive for them; `placeholder:text-red-500
  placeholder:text-blue-500` gives Native the red that Tailwind gives.
- Rust: `placeholder:text-red-500` assesses to `[0, 1, 1]`.
- Coverage: **300 of 320 inputs ranked (93.8%)**, up from 296 (92.5%).
