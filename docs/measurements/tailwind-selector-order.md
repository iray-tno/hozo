# Element selector variants and Tailwind order

Continues #1230 above [query variants](tailwind-query-order.md). Policy
**scalar-order-v10**.

## What was wrong

Variants that are a condition on the element itself weigh the same as each
other (`first:` and `data-active:`, both one class), or the same as the bare
utility (`rtl:` and `ltr:`, wrapped in `:where()`). Between equals the later
rule wins, and Tailwind's order decides which is later. Rule assessment
refused all of these selectors, so any input with one kept its authored
order: `rtl:p-4 p-2` kept `p-2` in a right-to-left page, and `data-active:p-2
first:p-4` let `first:` win where Tailwind lets `data-active:` win.

## What changed

- `element_selector_weight` reads a weight from a closed set of selector
  shapes, never from a colon count:
  - one bare pseudo-class (`&:first-child`, `&:required`, `&:checked`, …),
    except `:visited`: one;
  - `&:nth-child(…)` and the other three `nth` forms with a plain formula:
    one;
  - one `data-` attribute, bare or with a quoted value: one;
  - Tailwind's `open:` and `inert:` spellings: one;
  - Tailwind's `ltr:`/`rtl:`: none.
- The matching selector is recorded, and a write is ranked only when its own
  IR condition asks for exactly that selector text: `FirstChild`,
  `LastChild`, `FocusWithin`, `Target`, `Enabled`, `Open`, `Inert`,
  `Structural`, `FormState`, `Control`, `DataAttribute` and direction.
  Owner selectors (hover, focus, ARIA, …) keep their owner counts.
- Still unassessed: relations (`group-*`, `peer-*`, `in-*`, `has-*`),
  `not-*` outside ARIA, pseudo-elements, `:visited`, arbitrary selectors and
  ARIA values other than `"true"`.
- The dynamic Native map already generated `rtl:`/`ltr:` candidates. They
  now carry a rank and are orderable, and the resolver decides them once as
  ambient facts within the ranked order.

## Verification

- **Chromium, real Tailwind as the oracle.** Ten pairs in both authored
  orders, in `rtl` and `ltr` containers, hovered and not, on an element that
  is an only child with `data-active`, `data-state="open"` and `open`.
  `tailwindcss` 4.3.3 `build()` against Hozo's ordered
  `prepareWebModule(...).emit(context)` and the legacy `compile()`:
  **80 observations, 80 agree**. The legacy output disagreed in 32, for
  example `rtl:p-4 p-2` in RTL (Tailwind 16px, legacy 8px) and
  `data-active:p-2 first:p-4` (Tailwind 8px, legacy 16px).
- `packages/tailwind/src/selector-order.test.ts`: twelve pairs give identical
  Web CSS and Native static output in both orders. The generated Native map,
  run through the real resolver with `I18nManager.isRTL` both ways, gives the
  direction's own utility in both orders.
- Rust: each selector kind matches only its own text, and eleven
  near-misses (`:visited`, a pseudo-element, a relation, `in-*`, a spaced
  formula, an `of` formula, two attributes, a broken quote, a non-boolean
  ARIA value, a combinator, a compound) get no weight.
