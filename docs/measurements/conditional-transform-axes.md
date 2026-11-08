# Transform axes under different conditions

Part of #1230, registers/transforms domain, above
[transform axis ordering](tailwind-transform-axis-order.md). Not an ordering
policy change.

## What was wrong

Tailwind keeps each translate and scale axis in its own register
(`--tw-translate-x`, …) and reads them all in one declaration, so a
conditional class changes one axis and keeps the others. Hozo joined the
axes per condition instead:

- **Web**: `md:translate-x-8 translate-y-2` emitted `translate: 0 8px` and,
  under the query, `translate: 32px 0`. At md the y axis was lost; Tailwind
  gives `32px 8px`. Same for `md:scale-x-50 scale-y-75` (`0.5 1` for
  `0.5 0.75`).
- **Native**: each condition's style object carried a whole `transform`
  array, and RN lets the later one replace the earlier: `[{ translateX: 32 }]`
  at md. On Native this also hit different families, since RN has one
  array: `md:rotate-45 translate-x-2` dropped the translate at md.

Both orders were wrong identically, before and after ordering (#1806).

## What changed

- **Web**: when conditions write different axes of one family, each axis
  becomes a non-inheriting `--hozo-translate-*`/`--hozo-scale-*` register and
  every rule that touches the family reads them in one declaration, with
  `@property` rules declaring the initial values (`0`, `1`). An element whose
  axes share one condition, or whose conditions write the same axes
  (`scale-100 md:scale-95`), keeps its literal declarations. A family with an
  authored whole value or a reset keeps its old output.
- **Native**: the existing `hozoTransformStyles` slot composer, until now
  used only when a reset sat under a condition, is also used when conditions
  write different transform slots. Same-slot conditions keep the plain array.

## Not covered

- A runtime class string on Web goes through the candidate sheet, where each
  utility is its own class with a literal declaration; two runtime classes on
  different axes still replace each other there.
- `md:translate-none translate-x-2` in that authored order: `translate-none`
  is not ranked, so the input keeps its authored order (2 of 8 observations).
- Filters and shadows have the same per-condition joining; not changed here.

## Verification

- **Chromium, real Tailwind as the oracle**: 11 inputs (one axis under `md:`
  against another, bare against one axis, z, `md:`/`lg:` together,
  `rtl:`, same axes, rotate with translate) in both authored orders,
  500px and 1000px wide, LTR and RTL, reading computed `translate`, `scale`
  and `rotate`. **88 observations, 88 agree.** Before, the two motivating
  pairs disagreed in 4 observations each.
- `transform-resets.test.ts`: the compiled Native style expression, executed
  with md off and on, keeps both axes for 4 inputs in both orders
  (`[{ translateX: 32 }, { translateY: 8 }]` at md); one-condition and
  same-axis inputs do not import the composer; Web CSS has the registers and
  `@property` only for the split input.
