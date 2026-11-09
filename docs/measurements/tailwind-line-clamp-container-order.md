# Line clamps and query containers in Tailwind order

The rest of domain 4 of the [inventory](tailwind-order-inventory.md) after
[logical sizes and truncation](tailwind-logical-size-truncation-order.md):
`line-clamp-*` (7) and `@container` (2). Policy **scalar-order-v46**.

## What was wrong

- Web emitted a line clamp's four declarations (`overflow`, `display`,
  `-webkit-box-orient`, `-webkit-line-clamp`) after every other write in the
  rule, wherever the clamp was in the input. `line-clamp-2 flex` was
  `display: -webkit-box` where Tailwind gives `flex`, in either order, so a
  clamp could not be ranked.
- `@container` and `@container/<name>` had no ownership entry.

## What changed

- The clamp's declarations are emitted where the clamp is in the plan's
  order, so a later `display` or `overflow` wins as in Tailwind.
- `-webkit-line-clamp`, `container-type` and `container-name` join
  `scalar_css_property`. Native takes the last clamp
  ([since the previous layer](tailwind-logical-size-truncation-order.md)).
- `container` (the width-capped class) stays a barrier: Tailwind writes it
  as one rule per breakpoint.

## Verification

- **Chromium, real Tailwind as the oracle**, with Hozo's View base styles
  given to the Tailwind side: 6 inputs (two clamps, a clamp and its reset, a
  clamp against `flex`, `hidden` and `overflow-visible`, the two container
  types) in both orders, 500/1000px, LTR/RTL, reading `display`, `overflow`,
  the clamp, the box orientation, `container-type` and padding: **48 of 48
  agree**; authored order disagreed in 32.
- `line-clamp-container-order.test.ts`: 5 inputs give identical Web CSS and
  Native output in both orders; authored order is order-sensitive for them;
  `display: flex` follows the clamp's `-webkit-box`; Native shows Tailwind's
  three lines for `line-clamp-3 line-clamp-2`.
- `simple-projections.test.ts` lists `drop-shadow-md` as its still-barrier
  neighbour, in place of `line-clamp-2`.
- Inventory, domain 4: **1 gap** (`container`). Repository coverage
  unchanged at 318/320.
