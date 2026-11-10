# Known gaps against Tailwind

Part of #1230. One list of the places where Hozo's output is still known to
differ from Tailwind's, or where an input deliberately keeps its authored
order, each with the measurement page that found it. Each layer's page
keeps the detail; this page is the index. Update it when a gap closes or a
new one is measured.

State at main `4a9dd648`, policy `scalar-order-v30`.

## Different output

| Gap | Where | Found in |
| --- | --- | --- |
| Two conditions that both touch `boxShadow` or `backgroundImage` and are active together still lose each other's part. Ordinary conditional filter functions now compose; drop-shadow size/colour and filter animation endpoints remain outside that repair. | Native | [native-conditional-filter-shadow](native-conditional-filter-shadow.md), [native-conditional-filter-slots](native-conditional-filter-slots.md) |
| Runtime candidate filters, shadows and gradients still write whole declarations and replace each other's parts. Common transform axes now share the existing non-inheriting registers; mixed static/dynamic contributions and raw transform forms remain separate boundaries. | Web, runtime classes | [runtime-candidate-transforms](runtime-candidate-transforms.md), [conditional-transform-axes](conditional-transform-axes.md) |
| Native runtime candidate shadows/gradients and chains containing an unassessed drop-shadow still retain whole-declaration replacement. Ordinary filter functions now compose; this does not admit responsive/dark candidates or certify mixed static/dynamic chains. | Native, runtime classes | [native-candidate-filter-slots](native-candidate-filter-slots.md) |
| Shadow and drop-shadow colours serialise as the theme's `oklch(…)`; Tailwind's go through `color-mix(in oklab, …)` and compute to `oklab(…)`. Same colour, different string (`shadow-lg shadow-red-500`: 0 of 8 observations agree). | Web | [conditional-shadow-layers](conditional-shadow-layers.md) |
| Ratio leading and em tracking in a runtime class string are refused by the generated map (`no-native-output`): there is no font size to multiply by at that point. Static output resolves them against the element's font size. | Native, runtime classes | [tailwind-relative-text-order](tailwind-relative-text-order.md) |
| A text size's own line height is an absolute length in Hozo (`text-sm`: 20px); Tailwind's is a ratio of the font size (`calc(1.25 / 0.875)`). They agree until another utility changes the font size without a line height: `text-sm text-[2em]` is 32px over 45.71px in Tailwind and 32px over 20px in Hozo. | Web, Native | [tailwind-text-slash-order](tailwind-text-slash-order.md) |
| A colour on a theme shadow token whose value is a `var()` (`shadow-hozo-surface shadow-red-500`): Tailwind cannot open the `var()` and keeps the shadow's own colour; Hozo follows the chain and repaints it. | Web, Native | [tailwind-theme-shadow](tailwind-theme-shadow.md) |
| `outline-none`/`outline-hidden` on Native are `outlineWidth: 0`, since React Native has no `none` style. Tailwind sets `--tw-outline-style: none`, which every outline width then reads, so `outline-none focus:outline-2` shows no outline there, where Native draws the focus width. | Native | [border-style-order](tailwind-border-style-order.md#outline-none-and-outline-hidden) |
| `outline-hidden`'s `@media (forced-colors: active)` fallback (a transparent 2px outline) is not emitted. | Web | [border-style-order](tailwind-border-style-order.md#outline-none-and-outline-hidden) |
| `inline-flex` gets a synthetic `alignSelf: 'flex-start'` in static Native output and not in the generated map. Pre-existing; pinned by a test. | Native | [tailwind-inline-flex-order](tailwind-inline-flex-order.md) |

## Inputs that keep their authored order

An input with any of these writes is not ranked; every write in it keeps the
order it was written in, as before #1230. Each is a barrier for a stated
reason, not an oversight.

| Barrier | Why | Found in |
| --- | --- | --- |
| `filter-none`, `backdrop-filter-none` (Tailwind 3 names Hozo still reads; not Tailwind 4 classes) | They write the shared declaration itself, against every function rule's register chain. The transform resets rank since [transform-form-order](tailwind-transform-form-order.md). | [tailwind-filter-order](tailwind-filter-order.md) |
| Arbitrary relative lengths (`leading-[1em]`, `tracking-[1em]`) | An em length is not a ratio; static folding does not resolve it. | [tailwind-relative-text-order](tailwind-relative-text-order.md) |
| Opaque arbitrary passthrough classes (`columns-(--layout)`, `cursor-[…]`, `text-[150%]`, `text-[length:…]`) | A generic write with an owned name is not modelled. Readable arbitrary column counts/widths/auto now use the named ownership; unknown variables and two-value shorthands still do not. | [tailwind-columns-underline-offset-order](tailwind-columns-underline-offset-order.md) |
| `line-clamp-*`, `object-position`, masks, text shadows | Several declarations, or a Web-only keyword table, or registers not yet modelled. | [tailwind-columns-underline-offset-order](tailwind-columns-underline-offset-order.md) |
| Named and nested relations, custom dark selectors, pseudo-elements, arbitrary selectors | Weights not read from a closed set of shapes. | [tailwind-relation-order](tailwind-relation-order.md), [tailwind-selector-order](tailwind-selector-order.md) |
