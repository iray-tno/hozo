# Tailwind order inventory by domain

Part of #1230. The progress scale posted there scores six domains against
six stages; stage 5 is "every Native-supported value ranks; only
Native-refused or arbitrary/passthrough writes remain". Until now that was
judged. `scripts/tailwind-order-inventory.mjs` counts it.

## Method

- Every default Tailwind 4.3.3 class (no arbitrary values) is compiled
  beside `p-1`, ordered by Tailwind's own theme as a captured project is.
  The planner reports whether the class's block is ranked, or the barrier
  that keeps it in authored order.
- A class's domain comes from the properties Tailwind's own rule declares,
  not its name: registers and the style registers go to 3, font size,
  leading and tracking to 1, spacing, insets, gap, border widths, colours
  and radii and the children's scope to 2, everything else to 4.
- `tailwindClassesNativeRefusal` (measurement only) gives the first reason
  React Native refuses one of a class's writes. A barrier on a class
  Native refuses anyway is `native-refused`; a barrier on one it can
  express is a **gap**, what stage 5 counts.
- Every named variant is probed as `<variant>:p-2` on a `Pressable`
  (domain 5); a barrier is a gap when Native lowers it without an error.

The domain test is a regex over declared properties and the Native test a
refusal reason, so a row can be misfiled at the edges (a write Native
carries as a prop counts as lowered). The gap lists are the useful output;
each layer that closes one re-measures.

## State at main `9e7bf7d3`, policy `scalar-order-v42`

| Domain | Ranked | Gap | Native-refused | Unparsed |
| --- | --- | --- | --- | --- |
| 1. Compound typography | 66 | **0** | 0 | 0 |
| 2. Shorthands / logical / gap | 5,989 | 517 | 1,157 | 1 |
| 3. Registers / transforms | 3,227 | 341 | 6,630 | 0 |
| 4. Remaining supported properties | 3,220 | 445 | 1,691 | 2 |
| 5. Supported conditions (variants) | 248 | 23 | 60 | 67 |

The gaps, by root and barrier:

- **2**: `divide-<colour>` 286 and `divide`, `divide-x`, `divide-y`;
  `pbs`/`pbe`/`mbs`/`mbe` and their negatives (Tailwind 4.3's block-logical
  spacing) about 210; `space-*-reverse`. All `unmapped-property`.
- **3**: `drop-shadow` and its colours 298; `scale-z` 22; the resets
  (`transform-none`, `scale-none`, `rotate-none`, `translate-none`);
  `border`/`outline` style registers (`register-bound-property`); `via-none`.
- **4**: logical sizes `inline-*`, `min-inline-*`, `max-inline-*`,
  `block-*`, `min-block-*`, `max-block-*` 421; `line-clamp-*` 7; `origin-*`
  9; `truncate`, `whitespace-*`, `text-ellipsis`/`text-clip`; `container`.
- **5**: the `not-*` forms of states, queries and directions (19), `*:`
  and `**:`, `starting:`.

Domain 1 has no gap: what it still lacks (em leading and tracking in
arbitrary values, a text size's own line height as a ratio, the generated
map's relative metrics) is arbitrary or an output difference, listed in
[known gaps](tailwind-known-gaps.md).

## Progress

Gaps per domain after each layer that closes some. Re-run the script and add
a row.

| After | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| This page | 0 | 517 | 341 | 445 | 23 |
| [Logical sizes and truncation](tailwind-logical-size-truncation-order.md) | 0 | 517 | 341 | 10 | 23 |
| [Block spacing and dividers](tailwind-block-spacing-divide-order.md) | 0 | **0** | 341 | 10 | 23 |
| [Negated variants](tailwind-negated-variant-order.md) | 0 | 0 | 341 | 10 | 4 |
| [Line clamps and containers](tailwind-line-clamp-container-order.md) | 0 | 0 | 341 | 1 | 4 |
| [Drop shadows](tailwind-drop-shadow-order.md) | 0 | 0 | 44 | 1 | 4 |
| [Subtree and starting style](tailwind-subtree-starting-order.md) | 0 | 0 | 44 | 1 | 1 |
| [Border styles](tailwind-border-style-order.md) | 0 | 0 | 40 | 1 | 1 |
| [Outline styles](tailwind-border-style-order.md#outline-styles) | 0 | 0 | 37 | 1 | 1 |
| [`not-hover:`](tailwind-not-hover-order.md) | 0 | 0 | 37 | 1 | **0** |
| [Transform forms](tailwind-transform-form-order.md) | 0 | 0 | 8 | 1 | 0 |
