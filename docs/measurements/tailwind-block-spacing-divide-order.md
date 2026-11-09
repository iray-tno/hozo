# Block-logical spacing and dividers in Tailwind order

Domain 2 of the [inventory](tailwind-order-inventory.md), which counted 517
classes Native can express that kept their input in authored order. Policy
**scalar-order-v44**.

## What was wrong

- Tailwind 4.3's block-logical spacing (`pbs-*`, `pbe-*`, `mbs-*`, `mbe-*`
  and negatives, about 210 classes) had no ownership entry. `pt-4 pbs-8` kept
  authored order where CSS lets the later of the logical group win in
  Tailwind's order.
- Divider widths and colours (`divide-x`, `divide-y-2`, `divide-red-500`;
  about 300 classes) and the reverse flags (`space-y-reverse`,
  `divide-x-reverse`) were not read either, though
  [space](tailwind-space-order.md) already read the children's scope.

## What changed

- The four block-logical properties join `scalar_css_property`. Native
  writes each as its physical key (`pbs-*` is `paddingTop`), the key `pt-*`
  writes, so ranking decides which lands last.
- Divider widths (`border-inline-start-width`, `border-top-width`), divider
  colours (`border-color`) and the four reverse registers are written on the
  children, owned only by a children-scoped rule like the space gaps. A gap's
  rule also declares its reverse flag as 0, but a gap write owns its margin,
  not the flag.
- A divider **style** (`divide-dashed`) stays a barrier: it sets
  `--tw-border-style`, which every divider width reads, while Hozo writes the
  literal style, as for `border-dashed`.

## Verification

- **Chromium, real Tailwind as the oracle**, with Hozo's base styles given
  to both sides: 8 inputs in both orders, 500/1000px, LTR/RTL, reading the
  element's padding and margin and the first two children's margins, border
  widths, colour and style: **64 of 64 agree**; authored order disagreed in
  40. The reverse flags agree in both orders.
- `block-spacing-divide-order.test.ts`: the 8 inputs give identical Web CSS
  and Native output in both orders; authored order is order-sensitive for
  them; `divide-dashed` keeps authored order.
- Inventory, domain 2: **0 gaps** (from 517). Repository coverage unchanged
  at 318/320.
