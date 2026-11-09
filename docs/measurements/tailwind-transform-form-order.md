# Transform resets and forms in Tailwind order

Domain 3 of the [inventory](tailwind-order-inventory.md), where
`scale-z-*`, `scale-3d`, the transform resets and `transform`/`-gpu` were
29 of the 37 gaps left. Policy **scalar-order-v52**.

## What was wrong

Every transform axis rule in Tailwind writes its register and also the
shared declaration in its own form:

- `translate-x-2` writes `translate: var(--tw-translate-x) var(--tw-translate-y)`;
- `scale-x-50` and `scale-50` write the two-value `scale`, `scale-z-50` and
  `scale-3d` the three-value one;
- each rotate/skew function writes the `transform` chain.

A reset writes the declaration itself (`translate: none`). So the last rule
that writes the declaration decides its form, and the registers set before
it still apply.

Hozo held each axis as its own write, but had no write for the
declaration's form, so these were barriers. Two of its emissions also
ignored order:

- Web wrote a reset as an ordinary declaration and the composed axes after
  it. `scale-none scale-50` kept the scale, where Tailwind sorts
  `scale-none` last and turns it off.
- The three-value `scale` was chosen by whether any `scale-z-*`/`scale-3d`
  was written, not by whether it came last.

## What changed

- The resets, `Scale3d` and `TransformEmpty`/`TransformGpu` own the shared
  declaration (`translate`, `scale`, `rotate`, `transform`); the axes keep
  their registers.
- On Web, `translate_value`, `scale_value` and `transform_value` read the
  last whole-value write (a reset, an authored value, a `transform` form)
  against the last axis:
  - when the whole value is later, it wins: `none`, the authored value, or
    the chain with `translateZ(0)` in front for `transform-gpu`;
  - when an axis is later, the composed axes win.

  The three-value `scale` is chosen the same way, by the last `scale-3d`
  against the last x or y axis. Native already composed transforms by
  position (`transforms.rs`).
- Tests that used `translate-none` as a still-barrier example use
  `via-none`, and `outline-none` where the Native runtime map has to emit
  the class.

## Verification

- **Chromium, real Tailwind as the oracle**, with Hozo's View base styles
  given to the Tailwind side: 10 inputs in both orders, 500/1000px,
  LTR/RTL, reading `scale`, `translate`, `rotate`, `transform` and padding.
  **80 of 80 agree**; authored order disagreed in 34.
  - The inputs include `scale-z-50 scale-50`, `scale-3d scale-x-50`,
    `scale-none scale-50`, `translate-x-2 translate-none translate-y-4`,
    `transform-gpu rotate-x-45` and `md:translate-none translate-x-2`.
  - A first run, before the Web emission change, agreed in 48: every
    `scale-none`/`translate-none` input came out with the composed axes.
- `transform-form-order.test.ts`: the 10 inputs give identical Web CSS and
  Native output in both orders; authored order is order-sensitive for them;
  `scale-none scale-50` emits `scale: none`.
- Inventory, domain 3: **8 gaps** (from 37): divider styles,
  `drop-shadow-none`, `outline-hidden`, `outline-none`, `via-none`.
  Repository coverage unchanged at 318/320.
