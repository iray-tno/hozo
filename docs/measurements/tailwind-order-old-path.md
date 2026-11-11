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
not switched here. The method and original counts below are historical.

## Method

`setLegacyOrderingForMeasurement(false)` (measurement only, process-wide)
turns both compiler mechanisms off. `scripts/tailwind-order-old-path.mjs`
compiles every file of the coverage corpus for Web and Native, with them on
and off, in the coverage script's Tailwind context. It then lists every
component whose output changes. `legacy-ordering-switch.test.ts` is the
control: an input with a barrier (`hover:focus:p-2 active:p-4 columns-(--layout)`)
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
  (`columns-(--layout)`, `tracking-[1em]`), or a class the project's CSS does
  not generate, next to `hover:`/`focus:` writes. The interaction sort
  orders those writes by Tailwind's variant order; without it they keep the
  order they were written in.
- **A node with several Tailwind inputs** (for example two static class
  lists combined by an expression the parser keeps apart). The plan ranks
  within one input; the group sort orders across inputs by interaction
  weight: specificity first, then JSX input order, the cross-input rule of
  [ADR 011](../decisions/011-styling-inputs-keep-their-own-cascade.md).

## Deleting the interaction sort

The interaction sort put a barrier input's interaction writes in Tailwind's
order: weight first, then variant order. Both halves were checked before it
went.

- **Weight.** Native has no cascade, so an unranked `hover:focus:p-2
  active:p-4` needs the two-state rule after the one-state one. The
  condition-weight group sort does that, but only ran for nodes with several
  inputs. It now also runs for a single Tailwind input the plan did not
  rank, so this half is kept (`legacy-ordering-switch.test.ts` is now its
  control).
- **Variant order at equal weight** (`hover:` before `focus:`). This half
  is gone: a barrier input keeps the order it was written in there, on both
  backends. Barriers are now only arbitrary values and classes the
  project's CSS does not generate.

Deleting it exposed two inputs it had been rescuing in compiles with no
project CSS, `transition-colors` beside interaction writes. The built-in
descriptors had left `transition-*` and the shadow sizes undescribed, so
those inputs were barriers there. The built-in form choice now describes
them, and both inputs rank (`interaction-order.test.ts`).

After both changes the corpus still shows **0** components changed by
switching the remaining sort off.

## Removing the Web call to the remaining sort

The Web emitter now groups in source order. It delegates specificity to CSS
instead of applying the fallback weight sort intended for Native arrays.
Equal-specificity rules keep their existing relative order. The Native emitter
still uses the bounded sort for a barrier or a mixed input where it matters.

The negative control deliberately puts `hover:focus:p-2` before
`active:p-4` alongside an unassessed `columns-(--layout)`. The former Web
emitter changed CSS when the measurement switch was toggled. It now emits
the same CSS in both modes, with the conjunction first, while the Native
emitter still changes its output if the needed sort is removed. The independent
Storybook browser test compares the overlapping-state result to Tailwind CSS.
The browser test passed on Chrome with real mouse hover and press, together
with the existing mixed StyleX/Tailwind source-sheet comparison. The
corpus script compiled 819 files (721 components per target, no failed
files) and observed no changes with the measurement switch. The Web zero
is now a control, not evidence that the Native fallback can also be deleted.
