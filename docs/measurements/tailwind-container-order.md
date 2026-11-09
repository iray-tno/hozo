# `container` in Tailwind order

The last gap in the [inventory](tailwind-order-inventory.md), domain 4.
Policy **scalar-order-v56**.

## What was wrong

Tailwind writes `container` as one unprefixed rule:

```css
.container {
  width: 100%;
  @media (width >= 40rem) { max-width: 40rem; }
  /* … one branch per breakpoint */
}
```

The assessment read one branch per rule, so `container` was a barrier. Two
things stood behind that:

- Hozo expands `container` into `w-full` and `sm:max-w-[40rem]` …
  `2xl:max-w-[96rem]`. Each of those writes has to be matched to the
  rule's own declarations or to the branch at its width.
- The branches sit at the rule's place in the order, which can be *before*
  an unprefixed write of the same property. Tailwind sorts `max-w-5xl` after
  `container`, so at every width `max-w-5xl` wins (same weight, later). Both
  backends emit a conditional style after the unconditional ones whatever
  its place, so `container max-w-5xl` took the container's width at each
  breakpoint, in either authored order.

## What changed

- `breakpoint_branches` recognises an unprefixed rule whose other branches
  are each a `(width >= …)` query holding only declarations. The assessment
  lists each property once, so ownership finds one owner.
- `scalar_write_priority` matches the write to the right part of the rule:
  an unconditional write to the rule's own declarations, a `sm:`…`2xl:`
  write to the branch at that width (640…1536px).
- `order_scalars`, after ranking, drops a breakpoint write when a later
  unconditional write of the same property, at no lower weight, follows it
  in the same input. Tailwind's cascade never lets that branch win. A
  variant's rule always sorts after every unprefixed one, so this never
  touches `md:` and the like; it applies only to branches inside an
  unprefixed rule.

## Verification

- **Chromium, real Tailwind as the oracle**, with Hozo's View base styles
  given to the Tailwind side: 7 inputs in both orders, at 500, 700, 900, 1100,
  1400 and 1700px, reading `width`, `max-width` and padding. **84 of 84
  agree**; authored order disagreed in 36.
  - The inputs include `container max-w-5xl`, `max-w-sm container`,
    `container md:max-w-none`, `container w-auto` and
    `container lg:max-w-xs`.
- `container-order.test.ts`: 5 inputs give identical Web CSS and Native
  output in both orders. Neither backend emits the container's breakpoint
  widths beside `max-w-5xl`.
- Inventory: **0 gaps in every domain**. Repository coverage unchanged at
  318/320.
