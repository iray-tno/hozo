# `drop-shadow-none` and `via-none` in Tailwind order

The last two domain 3 gaps in the [inventory](tailwind-order-inventory.md).
Each resets a register that later rules can still read. Policy
**scalar-order-v55**.

## `drop-shadow-none`

Tailwind sorts the drop-shadow rules in a fixed order: size, then
`drop-shadow-none`, then colour.

- A size rule sets `--tw-drop-shadow-size` and an uncoloured
  `--tw-drop-shadow`.
- `none` empties `--tw-drop-shadow`.
- A colour rule rebuilds `--tw-drop-shadow` from the size register.

So a colour brings the size's shadow back even after `none`
(`drop-shadow-red-500 drop-shadow-md drop-shadow-none` draws a red md
shadow). Hozo held `none` and the size as one write, so the last one
replaced the other and the size was lost.

- `drop-shadow-none` is now its own write (its own `dedupe_key`) and owns
  `--tw-drop-shadow`.
- Both backends (`filter_value`, `filter_entry`) compose by that fixed
  order:
  - a colour keeps the size's shadow;
  - `none` without a colour turns it off;
  - `none` alone draws nothing.
- Web wrote an emptied chain as `filter: ;`, an invalid declaration that left
  an earlier filter standing (`md:drop-shadow-none drop-shadow-lg` kept the
  shadow at md). It now writes `none`, what Tailwind's chain of empty
  registers computes to.

## `via-none`

`via-none` is `--tw-gradient-via-stops: initial`, which sends every
`--tw-gradient-stops` that reads it back to the from/to fallback. Tailwind
sorts it before every `via-<colour>`, so within one condition Hozo's last
write already agrees. It now owns `--tw-gradient-via-stops`.

Across conditions, the Web register composition
([conditional gradient stops](conditional-gradient-stops.md)) refused any
element with `via-none`. Now it writes `--hozo-gradient-via-stops: initial`
there, the same structure as Tailwind's.

## Verification

- **Chromium, real Tailwind as the oracle**, with Hozo's View base styles
  given to the Tailwind side: 8 inputs in both orders, 500/1000px, LTR/RTL,
  reading `filter`, `background-image` and padding. **64 of 64 choose the
  same shadow and stops**; 8 of them serialise the shadow colour
  differently (`oklch` against `oklab`, the same `red-500`), the known
  shadow colour gap. Authored order disagreed in 20.
  - The inputs include the three-way drop shadow above,
    `md:drop-shadow-none drop-shadow-lg`, `md:via-none` over a three-stop
    gradient, and `via-none md:via-blue-500`.
  - Earlier runs, before each fix, showed the lost size (8), the invalid
    empty filter at md (4) and the refused conditional via-none (8).
- `drop-shadow-none-via-none-order.test.ts`: 7 inputs give identical Web CSS
  and Native output in both orders. The three-way input keeps the md shadow,
  and `md:drop-shadow-none` writes `filter: none`.
  `conditional-gradient-registers.test.ts` now expects the via register.
- Inventory, domain 3: **0 gaps**. Repository coverage unchanged at
  318/320.
