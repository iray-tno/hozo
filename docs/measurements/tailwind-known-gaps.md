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
| Two conditions that both touch `filter`, `boxShadow` or `backgroundImage` and are active together lose each other's part (`md:blur-sm hover:sepia grayscale`, hovered at md). Each conditional style carries the base; the later one replaces the earlier. Needs a runtime composer like `hozoTransformStyles`. | Native | [native-conditional-filter-shadow](native-conditional-filter-shadow.md) |
| A runtime class string goes through the candidate sheet, one rule per utility with a literal declaration, so `translate-*`, `scale-*`, filters, shadows and gradients on different utilities replace each other instead of composing. | Web, runtime classes | [conditional-transform-axes](conditional-transform-axes.md) |
| Shadow and drop-shadow colours serialise as the theme's `oklch(…)`; Tailwind's go through `color-mix(in oklab, …)` and compute to `oklab(…)`. Same colour, different string (`shadow-lg shadow-red-500`: 0 of 8 observations agree). | Web | [conditional-shadow-layers](conditional-shadow-layers.md) |
| The literal `backdrop-filter` chain puts `opacity` last; Tailwind reads it before `saturate`. Only the register form (conditions split) uses Tailwind's place. | Web | [conditional-filter-functions](conditional-filter-functions.md) |
| Ratio leading and em tracking in a runtime class string are refused by the generated map (`no-native-output`): there is no font size to multiply by at that point. Static output resolves them against the element's font size. | Native, runtime classes | [tailwind-relative-text-order](tailwind-relative-text-order.md) |
| A text size's own line height is an absolute length in Hozo (`text-sm`: 20px); Tailwind's is a ratio of the font size (`calc(1.25 / 0.875)`). They agree until another utility changes the font size without a line height: `text-sm text-[2em]` is 32px over 45.71px in Tailwind and 32px over 20px in Hozo. | Web, Native | [tailwind-text-slash-order](tailwind-text-slash-order.md) |
| A colour on a theme shadow token whose value is a `var()` (`shadow-hozo-surface shadow-red-500`): Tailwind cannot open the `var()` and keeps the shadow's own colour; Hozo follows the chain and repaints it. | Web, Native | [tailwind-theme-shadow](tailwind-theme-shadow.md) |
| `inline-flex` gets a synthetic `alignSelf: 'flex-start'` in static Native output and not in the generated map. Pre-existing; pinned by a test. | Native | [tailwind-inline-flex-order](tailwind-inline-flex-order.md) |

## Inputs that keep their authored order

An input with any of these writes is not ranked; every write in it keeps the
order it was written in, as before #1230. Each is a barrier for a stated
reason, not an oversight.

| Barrier | Why | Found in |
| --- | --- | --- |
| Resets: `translate-none`, `scale-none`, `rotate-none`, `transform-none`, `filter-none`, `backdrop-filter-none` | They write the shared declaration itself, not a register, so they need ownership against every register rule (`md:translate-none translate-x-2`: 2 of 8 observations disagree). | [conditional-transform-axes](conditional-transform-axes.md), [tailwind-filter-order](tailwind-filter-order.md) |
| `drop-shadow-none` | Writes `--tw-drop-shadow` itself, which every size and colour rule also sets. | [drop-shadow-order](tailwind-drop-shadow-order.md) |
| `scale-3d` | Switches the declaration's form; owns no register. | [tailwind-skew-rotate-axis-order](tailwind-skew-rotate-axis-order.md) |
| Outline and divider style utilities (`outline-dotted`, `divide-dashed`) | They set `--tw-outline-style`/`--tw-border-style`, read by every outline or divider width; Hozo writes those widths' style as a literal. Border styles rank since [border-style-order](tailwind-border-style-order.md). | [tailwind-border-width-order](tailwind-border-width-order.md), [tailwind-outline-order](tailwind-outline-order.md) |
| Arbitrary relative lengths (`leading-[1em]`, `tracking-[1em]`) | An em length is not a ratio; static folding does not resolve it. | [tailwind-relative-text-order](tailwind-relative-text-order.md) |
| Arbitrary passthrough classes (`columns-[10rem]`, `cursor-[…]`, `text-[150%]`, `text-[length:…]`) | A generic write with an owned name is not modelled (`columns-[10rem] columns-3`: 4 of 8 disagree). | [tailwind-columns-underline-offset-order](tailwind-columns-underline-offset-order.md) |
| `via-none` beside a conditional gradient | Takes the middle stop out of the list through `--tw-gradient-via-stops: initial`. | [conditional-gradient-stops](conditional-gradient-stops.md) |
| `line-clamp-*`, `object-position`, masks, text shadows | Several declarations, or a Web-only keyword table, or registers not yet modelled. | [tailwind-columns-underline-offset-order](tailwind-columns-underline-offset-order.md) |
| Named and nested relations, custom dark selectors, pseudo-elements, arbitrary selectors | Weights not read from a closed set of shapes. | [tailwind-relation-order](tailwind-relation-order.md), [tailwind-selector-order](tailwind-selector-order.md) |
