# More direct properties in Tailwind order

Continues #1230 above [element selectors](tailwind-selector-order.md). Policy
**scalar-order-v11**.

## What was wrong

A write takes part in ordering only when `scalar_css_property` names the one
CSS property it owns. `display: block`, the four physical insets,
`aspect-ratio`, `order` and the all-corner `border-radius` had no entry, so an
input with one kept its authored order. `md:block hidden` hid the element at
every width; `md:rounded-lg rounded-sm` kept the small radius.

## What changed

Seven ownership entries, each one CSS property and at most one Native key:

| IR write | CSS property | Native key |
| --- | --- | --- |
| `Display::Block` | `display` | `display: 'flex'` (Yoga has no block) |
| `InsetTop`/`Right`/`Bottom`/`Left` | `top`/`right`/`bottom`/`left` | the same |
| `AspectRatio` | `aspect-ratio` | `aspectRatio`, when numeric |
| `Order` | `order` | none (Yoga has no `order`) |
| `BorderRadius` | `border-radius` | `borderRadius` |

Not added, and why:
- `inset-x-*` and the logical insets: `inset-inline` is a logical alias,
  the same open question as `px-*` and `gap-*` (see the gap alias boundary).
- Per-corner radii: Native's `borderTopLeftRadius` beats `borderRadius`
  whatever the order, which is not CSS's rule. Added later as
  [corner radii](tailwind-corner-radius-order.md).
- `InlineFlex`: two Native keys.
- Border width and style, shadows, rings, transforms, transitions, filters
  and `grid-cols`: several declarations or registers per utility.

## Verification

- **Chromium, real Tailwind as the oracle**: seven pairs in both authored
  orders, 500px and 1000px wide, hovered and not. **56 observations, 56
  agree.** The legacy output disagreed in 12, for example `md:block hidden`
  at 1000px (Tailwind `block`, legacy `none`).
- `direct-property-order.test.ts`: nine pairs give identical Web CSS and
  Native static output in both orders. The generated Native map, run
  through the real resolver, lets `hidden` win over `block` and `flex` in
  either order, as Tailwind does.
