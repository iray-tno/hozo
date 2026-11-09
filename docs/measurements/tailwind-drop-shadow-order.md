# Drop shadows in Tailwind order

Domain 3 of the [inventory](tailwind-order-inventory.md), which counted 341
classes Native can express that kept their input in authored order;
`drop-shadow-*` and its colours were 298 of them. Policy
**scalar-order-v47**.

## What was wrong

[Filters](tailwind-filter-order.md) left drop shadows out, because the
filter register pairs with a colour and a size register. So an input with
any drop shadow kept its whole class list in authored order:
`drop-shadow-md drop-shadow-lg` took whichever was written last.

## What changed

Tailwind writes the pair as two registers:

- a size rule sets `--tw-drop-shadow-size`, which reads
  `var(--tw-drop-shadow-color, <default>)`;
- a colour rule sets `--tw-drop-shadow-color`.

So each write owns one register: a size `Filter(DropShadow, …)` the size,
`DropShadowColor` the colour. Hozo already composes the two at emit time
(`repaint_shadow`), so ranking decides which size and which colour survive.
`drop-shadow-none` writes `--tw-drop-shadow` itself, which every size and
colour rule also sets, and stays a barrier.

## Verification

- **Chromium, real Tailwind as the oracle**: 6 inputs (two sizes, two
  colours with a size, a size among other filters, a size beside a padding
  conflict, `md:` against two sizes, a colour against a size) in both
  orders, 500/1000px, LTR/RTL, reading `filter` and padding: **48 of 48
  choose the same size and colour**. 16 of them serialise the colour
  differently: Hozo writes the theme's `oklch(0.637 0.237 25.331)`, Tailwind
  `color-mix` gives `oklab(0.637 0.2142 0.1014)`, the same `red-500`. That
  is the shadow colour gap already in [known gaps](tailwind-known-gaps.md),
  not order.
- `drop-shadow-order.test.ts`: 5 inputs give identical Web CSS and Native
  output in both orders; authored order is order-sensitive for them;
  `drop-shadow-none` keeps authored order.
- Rust: a sized drop shadow owns `--tw-drop-shadow-size`; `drop-shadow-none`
  is not in the ranked domain.
- Inventory, domain 3: **44 gaps** (from 341). Repository coverage unchanged
  at 318/320.
