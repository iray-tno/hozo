# Border styles in Tailwind order

Domain 3 of the [inventory](tailwind-order-inventory.md). Policy
**scalar-order-v49**.

## What was wrong

Tailwind's width rules write `border-style: var(--tw-border-style)`, and a
style rule (`border-dashed`) sets that register and the style. So wherever a
style utility applies, it decides the style, whatever the order or
condition: `border-dashed md:border-4` stays dashed at `md`.

Hozo's width utilities wrote a literal `solid` beside the width. Ranked, it
could override a written style: `md:border-4` turned an unconditional dashed
border solid at `md`. So every input with a written border style kept its
authored order (`register-bound-property`).

## What changed

- A width's implied style is a new `BorderStyle::Default`. It is
  `Origin::Default`, so it loses to a written style in `dedupe_last_wins`.
- On **Web**, Hozo emits it in its own rule at zero specificity,
  `:where(.hozo-N) { border-top-style: solid; … }`, inside the same queries
  as the width. Any written style that applies, at `(0,1,0)` or more, beats
  it, as the register does in Tailwind. (Under a pseudo-element, which
  cannot sit inside `:where()`, it stays inline as before.)
- On **Native**, it writes nothing: React Native's own default
  `borderStyle` is `solid`, and writing it would override a written style
  earlier in the style array.
- A written border style is no longer register-bound and ranks like any
  other write. Outline and divider styles still are: their widths still
  write a literal style.

## Verification

- **Chromium, real Tailwind as the oracle**, with `border: 0 solid` given to
  the Tailwind side as Hozo's View base has it: 8 inputs (a style beside a
  width, two styles beside a width, `border-dashed md:border-4`,
  `hover:border-dashed md:border-2`, a style beside a side width and a
  padding conflict, `border-solid border-dashed border-2`, `border-x-2
  border-dotted`, `border-none border-2`) in both orders, 500/1000px,
  hovered and not, reading the top and left styles and widths and padding:
  **64 of 64 agree**; authored order disagreed in 12.
- `border-style-order.test.ts`: 6 inputs on a `View` and a `Text` give
  identical Web CSS and Native output in both orders; the implied style is a
  `:where()` rule on Web; Native keeps `borderStyle: 'dashed'` and writes no
  `'solid'` for `border-dashed md:border-4`.
- Tests that used `border-dashed` as a still-barrier example now use
  `outline-dashed` (or, for the runtime map, the same); the border-width
  test now asserts the two orders agree.
- Rust: the parser emits `BorderStyle::Default` for every width; `origin()`
  tells it from a written style.
- Inventory, domain 3: **40 gaps** (from 44). Repository coverage unchanged
  at 318/320.

## Outline styles

Policy **scalar-order-v50**. An outline width reads `--tw-outline-style`
the same way, so the same change applies: `outline` and `outline-<n>`
imply `BorderStyle::Default`, emitted at zero specificity on Web and
nothing on Native, whose `outlineStyle` defaults to solid
(`BaseViewProps`' `outlineStyle{OutlineStyle::Solid}`). With no style
left register-bound, the `register_bound` check and its
`register-bound-property` barrier are gone. `outline-none` stays out: on
Native it is `outlineWidth: 0`, a width key.

- **Chromium, real Tailwind as the oracle**: 5 inputs (a style beside a
  width, beside `focus:outline-2`, `focus:outline-dotted outline-4`, two
  styles beside `outline`, a style conflict beside `md:outline-2` and a
  padding conflict) in both orders, 500/1000px, LTR/RTL, light/dark,
  focused and not, reading the outline style and width and padding:
  **160 of 160 agree**; authored order disagreed in 32.
- `outline-style-order.test.ts`: the 5 inputs give identical Web CSS and
  Native output in both orders; Native writes no `'solid'` for
  `outline-dashed focus:outline-2`. `outline-order.test.ts` now expects
  `outline-dashed` to rank and `outline-none` not to. Tests that used
  `outline-dashed` as a still-barrier example use `divide-dashed`.
- Inventory, domain 3: **37 gaps** (from 40).
