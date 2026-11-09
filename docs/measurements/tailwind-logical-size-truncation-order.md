# Logical sizes, origins and truncation in Tailwind order

The first domain 4 layer chosen from the
[inventory](tailwind-order-inventory.md), which counted 445 classes Native
can express that kept their input in authored order. Policy
**scalar-order-v43**.

## What was wrong

- `inline-*`, `block-*` and their `min-`/`max-` forms (421 classes),
  `origin-*`, `truncate`, `whitespace-*` and `text-ellipsis`/`text-clip` had
  no ownership entry. `w-4 inline-8` kept authored order where CSS lets the
  later of the logical property group win in Tailwind's order.
- Native's truncation (`numberOfLines`) read whether `whitespace-nowrap`
  and `text-ellipsis` were present anywhere, and the **first** line clamp.
  So `truncate whitespace-normal` truncated on Native while Web wraps, and
  `line-clamp-2 line-clamp-3` showed two lines where CSS shows three.

## What changed

- The six logical sizes, `transform-origin`, `white-space` and
  `text-overflow` join `scalar_css_property`, one declaration each. Native
  writes a logical size as its physical key (`inline-*` is `width`), the
  same key `w-*` writes, so ranking decides which lands last, as the logical
  property group does in CSS.
- Native truncation reads the last line clamp, the last `white-space` and
  the last `text-overflow`.
- `line-clamp-*` stays a barrier. Its rule also declares `display` and
  `overflow`, and Web emits a clamp's declarations after every other write,
  so `line-clamp-2 flex` would rank as Tailwind does and still come out
  `-webkit-box` where Tailwind gives `flex`. Recorded in
  [known gaps](tailwind-known-gaps.md).

## Verification

- **Chromium, real Tailwind as the oracle**, with Hozo's View base styles
  given to the Tailwind side too: 8 inputs in both orders, 500/1000px,
  LTR/RTL, reading sizes, `transform-origin`, `white-space`,
  `text-overflow`, `overflow` and padding: **64 of 64 agree**; authored order
  disagreed in 32. A first run included `line-clamp-2 flex`/`block`, which
  disagreed in every observation and showed the emission problem above.
- `logical-size-truncation-order.test.ts`: 7 inputs give identical Web CSS
  and Native output in both orders; authored order is order-sensitive for
  them; Native leaves `whitespace-normal truncate` wrapping and takes the
  last line clamp.
- Inventory, domain 4: **10 gaps** (from 445): `line-clamp-*` 7 and the
  `container`/`@container` classes 3. Coverage of this repository is
  unchanged at 318/320.
