# What the ordering outside the plan still decides

Part of #1230. The progress scale's stage 6 deletes each domain's old
ordering path. Two of the three mechanisms listed under
[coverage](tailwind-order-coverage.md#ordering-outside-the-shared-plan) run
in the compiler:

- the interaction sort (`order_tailwind_interactions`), which puts a
  barrier input's `hover:`/`focus:`/`active:` writes in Tailwind's variant
  order;
- the condition-weight group sort (`group_by_condition`), which orders a
  node's condition groups by owner-interaction weight when the node is not
  one ranked input.

The third, the runtime state rank, lives in the generated resolver and is
not switched here.

## Method

`setLegacyOrderingForMeasurement(false)` (measurement only, process-wide)
turns both compiler mechanisms off. `scripts/tailwind-order-old-path.mjs`
compiles every file of the coverage corpus for Web and Native, with them on
and off, in the coverage script's Tailwind context. It then lists every
component whose output changes. `legacy-ordering-switch.test.ts` is the
control: an input with a barrier (`focus:p-2 hover:p-4 columns-[10rem]`)
does change, on both backends, when they are off.

## Result

On top of the stack that closes the inventory's last gaps (#1860):

```
317 files (281 Web and 281 Native components, 0 files failed to compile);
the ordering outside the plan changes 0 Web and 0 Native components.
```

Neither mechanism decides anything in this repository any more. A first
run reported zero because the script passed the file name where
`compileNativeModule` takes its bindings, so every Native compile threw.
The script now prints how many components it compiled and how many files
failed.

## What they still serve in general

Nothing in this corpus, but the old path is still reachable by inputs the
plan does not rank:

- **A barrier input with interaction variants**: an arbitrary value
  (`columns-[10rem]`, `tracking-[1em]`), or a class the project's CSS does
  not generate, next to `hover:`/`focus:` writes. The interaction sort
  orders those writes by Tailwind's variant order; without it they keep the
  order they were written in.
- **A node with several Tailwind inputs** (for example two static class
  lists combined by an expression the parser keeps apart). The plan ranks
  within one input; the group sort orders across inputs by interaction
  weight: specificity first, then JSX input order, the cross-input rule of
  [ADR 011](../decisions/011-styling-inputs-keep-their-own-cascade.md).
