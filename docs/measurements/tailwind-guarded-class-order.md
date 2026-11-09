# Guarded classes in Tailwind order

Continues #1230 above [transitions and font families](tailwind-transition-font-family-order.md),
chosen because the coverage script put it next: once transitions ranked,
`px-3` with `unassessed-condition` held 8 class lists, all the size variants
of `@hozo/ui`'s buttons. Policy **scalar-order-v35**.

## What was wrong

A class behind a JS guard, `cx(base, size === 'sm' && 'px-3 py-2')`, has a
`Condition::Expr` on each write. `scalar_write_priority` checked that
condition as a selector, found nothing for it in Tailwind's plain rule, and
refused, so the whole class list kept authored order. A guard decides
whether a class is present, not which selector matches; when it holds,
Tailwind's order decides between the present classes.

Native had a second defect underneath. Its style array always put the
unconditional styles before every conditional one, guards included:
`cx(on && 'p-2', 'p-4')` was `[hozo0, on && hozo0_cond]`, so `p-2` won when
`on` held, while Web, emitting the guard inside a weightless `:where()`, let
the later `p-4` rule win. The two platforms disagreed for that authored
order before this change.

## What changed

- `scalar_write_priority` treats `Condition::Expr` as weightless presence,
  like `Always`: no specificity, no query.
- Native, for a ranked (canonical) input only, keeps a guarded style among
  the unconditional ones in the plan's order instead of after them. An
  unranked input keeps the old base-then-guards layout.
- `scalar_ordering_visits_real_nested_and_secondary_ir_...` pinned "captured
  JS guards are a complete-input barrier". A captured predicate is evaluated
  once at its original position, in a separate array, so reordering the
  declarations it guards cannot move or repeat that evaluation. The test now
  asserts the input is ranked (`p-4` last) and every declaration, captured
  expression included, is kept.

## Verification

- `guarded-class-order.test.ts`: `cx('p-4', on && 'p-2')` and a three-class
  guarded variant give the same Web CSS and Native styles in both authored
  orders (guard class names, which carry source offsets, normalised). Web
  emits the guarded 8px rule before the unguarded 16px one; Native's array
  puts the guarded object before the base, so `p-4` wins when `on` holds on
  both platforms, as in Tailwind.
- Coverage: **283 of 320 inputs ranked (88.4%)**, up from 268 (83.8%).
- `@hozo/ui` 86, `@hozo/patterns` 165 and native-showcase 240 pass
  unchanged: their guarded variants are mutually exclusive sizes, which no
  order changes.

The Chromium oracle compares static class lists and cannot express a JS
guard; the evidence here is the emitted order on both platforms.
