# Subtree and starting-style variants in Tailwind order

Domain 5 of the [inventory](tailwind-order-inventory.md), which left four
variants Native lowers whose inputs kept authored order: `*:`, `**:`,
`starting:` and `not-hover:`. This reads the first three. Policy
**scalar-order-v48**.

## What changed

- `*:` and `**:` are `:is(& > *)` and `:is(& *)` in Tailwind. `:is()` weighs
  its argument, the class, so they add nothing to the class's weight;
  `Condition::Subtree` asks for that selector. Native already hands these
  writes to the children at build time; ranking decides which of the
  parent's subtree writes survives.
- `starting:` is an `@starting-style` wrapper with no weight; the assessment
  reads that at-rule and `Condition::StartingStyle` asks for it.
- `not-hover:` stays: Tailwind writes it as two sibling rules.

## Verification

- **Chromium, real Tailwind as the oracle**: 5 inputs in both orders,
  500/1000px, LTR/RTL, reading padding, the element's opacity and its two
  children's padding and opacity. The element carries a 1000 s opacity
  transition, so the opacity read right after insertion is the starting
  style (0.50 for `starting:opacity-0 starting:opacity-50`, 0.00 for
  `starting:opacity-0 opacity-75 opacity-50`). **40 of 40 agree**; authored
  order disagreed in 20.
- `subtree-starting-order.test.ts`: the 5 inputs give identical Web CSS and
  Native output in both orders; authored order is order-sensitive for them.
- Inventory, domain 5: **1 gap** (`not-hover:`). Repository coverage
  unchanged at 318/320.
