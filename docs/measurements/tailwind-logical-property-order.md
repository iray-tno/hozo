# Logical edges and insets in Tailwind order

Continues #1230 above [direct properties](tailwind-direct-property-order.md).
Policy **scalar-order-v12**.

## What was wrong

`px-*`, `mx-*`, `ps-*`/`pe-*`, `ms-*`/`me-*`, `inset-*`, `inset-x-*`,
`inset-y-*` and `start-*`/`end-*` were outside the ordering domain, so an input
with one kept its authored order. `md:px-4 px-2` kept `px-2` at every width,
and `ps-2 px-4` let `px-4` overwrite the start edge, where Tailwind keeps
`ps-2`'s.

## What changed

The logical padding and margin edges and every inset write join the domain.
`covers` now also names `inset` for the four physical edges, and the logical
and block insets own exactly their one declaration:

| Utility | Tailwind declaration | IR writes |
| --- | --- | --- |
| `px-2` | `padding-inline` | `PaddingInlineStart`, `PaddingInlineEnd` |
| `ps-2` | `padding-inline-start` | `PaddingInlineStart` |
| `mx-2`, `mx-auto`, `-mx-2` | `margin-inline` | `MarginInlineStart`, `MarginInlineEnd` |
| `inset-2` | `inset` | `InsetTop`/`Right`/`Bottom`/`Left` |
| `inset-x-2` | `inset-inline` | `InsetInline` |
| `inset-y-2` | `inset-block` | `InsetBlock` |
| `start-2`, `inset-s-2` | `inset-inline-start` | `InsetInlineStart` |

Why ranking a logical write is safe on Native although Yoga resolves logical
and physical edges differently from CSS: Yoga picks between `paddingStart`
and `paddingLeft` by key, never by order, so moving them changes nothing
there. Ranking only reorders writes to the **same** key (`ps-2 px-4` both
write `paddingStart`) and the Web cascade, and in both of those Tailwind's
order is the answer.

Not changed, and why:
- `ps-2 pl-4` (logical against physical on one edge) still differs on Native:
  CSS lets the later `padding-left` win, Yoga lets `paddingStart` win. That
  was so before this change, in both authored orders.
- `gap-*` is a [separate layer](tailwind-gap-order.md): it also meets the
  authored-style composition in the
  [gap alias boundary](tailwind-gap-alias-boundary.md).

## Verification

- **Chromium, real Tailwind as the oracle**: 25 pairs in both authored orders,
  500px and 1000px wide, LTR and RTL, reading the computed padding, margin and
  inset of the element. **200 observations, 200 agree.** The legacy output
  disagreed in 72, for example `md:px-4 px-2` at 1000px (Tailwind 16px,
  legacy 8px) and `px-4 ps-2` (Tailwind start 8px, legacy 16px).
- `logical-property-order.test.ts`: 16 pairs give identical Web CSS and
  Native static output in both orders; static Native gives `ps-2 px-4`
  `paddingStart: 8` in both orders; the generated Native map, run through the
  real resolver, gives `ps-2 px-4` and `me-2 mx-4` Tailwind's edges in both
  orders.
- `cargo test -p hozo_ir`: the new ownership test checks each write against
  17 CSS properties, owning exactly its own.
