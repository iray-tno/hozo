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
not switched here. The method and original counts below are historical;
the switch and old script are available in the history at `6a8bccd7`.

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

## One Native runtime state selector

The generated ranked plan and the whole-string fallback now prepare the same
cached entry shape. State updates share one selection loop. The fallback
still places resting writes before state writes, and the ranked plan can
interleave them. It is the duplicate selector and parallel group/name arrays
that are gone, not the fallback ordering rule. Cached resting arrays,
original style identities (including effect metadata keys) and missing-state
warnings are unchanged.

Bounded Node 25.9, Windows, single CPU comparison against `a8f66983`.
Same style objects and states, four rotating focus/press combinations.
Each of three fresh processes ran nine alternating old/new samples per row:
120,000 lookups of a cached string or 5,000 distinct strings in a fresh
resolver. The latter include unknown inert suffixes to defeat the cache.
Reported values are per-process medians, with no outliers removed:

| Input | Warm, ns/op old → new (three runs) | Cold, µs/op old → new (three runs) |
| --- | --- | --- |
| Resting only | 16.1 → 14.3; 16.3 → 14.4; 16.3 → 14.5 | 1.66 → 1.66; 1.60 → 1.64; 1.78 → 1.66 |
| Ranked, three state entries and ambient style | 126.3 → 119.2; 121.8 → 132.9; 129.5 → 121.8 | 4.92 → 3.84; 3.04 → 2.99; 3.00 → 2.91 |
| Same input plus one unranked style (fallback) | 168.3 → 123.1; 172.1 → 122.5; 166.7 → 123.1 | 3.49 → 1.93; 3.49 → 1.92; 3.39 → 1.91 |

The warm ranked row varies by process, including one slower run. These are
small, synthetic resolver timings, not a Hermes or app frame-time claim.

## One source for built-in owner variant order

Native fallback ranks now compress the four positions in the same built-in
Tailwind descriptors used by the compiler. The parser's separate
`OWNER_INTERACTION_ORDER` generated table and its comparator module are
gone. The old public Rust symbol is an alias, not a second implementation.
The emitted integer representation and whole-string fallback policy remain.

`packages/tailwind/src/order.test.ts` reads the emitted Native state tuples
and compares all 15 nonempty combinations of hover, focus, focus-visible and
active with real Tailwind CSS ordered by selector weight and emission order.
Disabled still has a tuple but no fallback rank in this bounded domain.

## Explicit Native condition projection

Source-aware grouping no longer decides whether to apply a backend-specific
sort. The Native plan returns ordered groups and the single-ranked-input proof
to the same emitter, replacing its separate provenance scan. The Native
projection does no sort for already monotone or unknown weights. It sorts
known inversions stably and coalesces adjacent groups in place. The pre-ranked
Tailwind order and the mixed-source equal-weight order are unchanged.

A new IR test covers a stronger conjunction separated from an equal
conjunction by a weaker condition, and the same input with an unassessed
dark guard. The latter must not be assigned weight zero. Against the parent
addon, normal output for 818 files (721 components per target) matched
byte for byte across Web JSX/CSS, Native JSX/styles, and both diagnostics.
The generated text fixture's compiler-source hashes are not part of that
corpus. The process-wide measurement switch is still present in this step.

## Removing the process-wide switch

The next step deletes the IR atomic flag and its N-API/TypeScript measurement
exports. Native specificity is now an explicit part of its condition plan,
not mutable process state. The positive emitted-style test checks all eight
hover/focus/press states with a real Tailwind barrier; the browser check
retains its independent Tailwind CSS. Neither test needs to disable normal
ordering to prove that the more specific condition wins.

`node scripts/tailwind-order-projection.mjs` is the read-only replacement for
before/after changes. With a fresh addon on both revisions, compare its
JSON record; missing or broken compiles fail rather than looking equal. The
818-file receipt from the previous step is unchanged after this deletion.

## Omit equal fallback ranks

Candidate modules only serialize the optional fallback rank on state tuples
when at least two known ranks differ in the namespace. Equal ranks already
keep authored order; a string with an unknown rank still falls back as
before. The compact built-in/captured priority table is unaffected.

The generated-module test puts an unranked `filter-none` between two state
classes, checks both equal-rank input orders, and checks that an earlier
higher-rank class still wins across different states. A cache scan of 51
`hover:opacity-0` … `hover:opacity-100` candidates produced 4,883 → 4,628 raw
bytes, 778 → 773 gzip bytes. Two unconditional candidates stayed 450/272
bytes; a three-candidate map with competing states stayed 644/327 bytes.
These are standalone generated module sizes, not app bundle results.

## Omit fallback ranks when the fallback cannot run

A finalized candidate namespace omits the old state-tuple rank when compact
ordering covers every emitted style and every state group. Refused and unknown
tokens never enter the rank lookup, so neither can send such a namespace
down the fallback. Reporting-only, conflict-free and partially assessed
namespaces keep their previous output.

All 15 combinations of the four bounded owner variants now match real
Tailwind using compact ranks alone, in both built-in and captured contexts.
Adding the drawable but uncaptured `text-brand` brings back the old tuples.
For 104 generated opacity candidates, the standalone module was 10,169 →
9,649 raw bytes, 1,372 → 1,385 gzip bytes. With the uncaptured token the
module stayed 10,228/1,412 bytes. This removes unused metadata, not a gzip
or runtime-speed win. The 818-file static projection receipt is unchanged.
