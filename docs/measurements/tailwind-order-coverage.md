# How much Tailwind the shared plan ranks, and what still needs the old path

Part of #1230, consolidation domain. RFC 007 §8.5 asks to delete the ad-hoc
ordering in parser, candidate output and resolver once the common plan owns
the same units. This page counts how much of a real corpus the plan owns
today, names every ordering mechanism outside it, and says what each still
serves, so a deletion can be argued from numbers instead of guessed.

State at main `bc4920ad`, policy `scalar-order-v33`.

## Coverage of this repository's own Tailwind

`scripts/tailwind-order-coverage.mjs` compiles every `.tsx` under
`packages/ui/src`, `packages/patterns/src` and `examples/` (no tests,
stories, generated or platform build output) against one captured context:
Tailwind's own theme plus `@hozo/ui`'s tokens. It counts every class input
with at least two Tailwind writes (one write has nothing to order). An input
is ranked only when no block in it reports a barrier; the plan capture now
reports one per block (`barrier`), the same question `order_scalars` asks.

```
256 of 320 multi-write Tailwind inputs ranked (80%) across 317 files
  unmapped-property: 33 -- transition-colors (15), shadow-hozo-surface (5), font-mono (5), grid (2), fixed (1)
  unassessed-selector: 17 -- placeholder:text-hozo-text-subtle (4), aria-pressed:bg-hozo-accent-subtle (4), space-y-2 (4), space-y-3 (2), space-y-4 (1)
  unassessed-condition: 8 -- flex (2), relative (1), absolute (1), rounded-hozo-panel (1), bg-hozo-accent (1)
  not-generated: 6 -- bg-brand (5), text-brand (1)
```

Each input on the old path is attributed to its first barrier; the counts
after each name are inputs, not writes.

Reading it:

- `not-generated` is the measurement's own limit: `bg-brand` is an example's
  private token, absent from the measured CSS. With Tailwind's theme alone,
  `@hozo/ui`'s tokens were also not-generated and the share was 69%.
- The rest are real barriers, and the top ones are the next graduation
  candidates: `transition-colors` (several declarations), `font-mono` (font
  family), a theme shadow token, and `aria-pressed:`/`placeholder:`
  conditions.
- An earlier draft collected names through the candidate cache, which only
  sees runtime class strings, and reported 10.6% with most inputs
  `uncollected`. The script now uses the parser's own utility table
  (`inspectTailwindOrder`).

## Ordering outside the shared plan

| Mechanism | Where | What it does | Still needed for |
| --- | --- | --- | --- |
| Interaction cascade sort | `crates/hozo_parser/src/interaction_order.rs` (`order_tailwind_interactions`) | Sorts owner-interaction conditions (`hover`, `focus`, `focus-visible`, `active`, conjunctions) by Tailwind's variant order within each input, before the plan runs. | Inputs with a barrier, and every compile with no Tailwind context. Redundant for a ranked input: the plan re-sorts it completely. |
| Condition-weight group sort | `crates/hozo_ir/src/lib.rs` (`group_by_condition`) | Sorts a node's condition groups by owner-interaction specificity. Skipped only when the node's styles are one ranked input (plus unconditional semantic defaults). | Nodes with an input on the old path, and nodes with several inputs (a class list beside a slot or `style`). |
| Runtime state rank | `crates/hozo_native/src/candidate.rs` (`StateGroup.order`) and `packages/engine/src/class-resolver.ts` | The generated map gives each state group the same interaction cascade key; the resolver sorts by it once per cached string. Already skipped when the plan's ranks cover the whole string. | Runtime strings with any unranked class. |

Not on this list, because they are platform semantics rather than a second
ordering: `dedupe_last_wins`'s rule that a written value beats a text size's
fallback (Tailwind's `--tw-leading` register), Native's base / conditional /
owner-state partition (`crates/hozo_native/src/conditions.rs`), and the
register and slot composition added for transforms, filters, shadows and
gradients.

## What deleting them needs

All three serve the inputs the plan does not rank (the group sort also
serves nodes with several inputs, which the plan never merges). They can go only
when no input reaches the old path, which takes two things:

1. **Every barrier closed** -- the table above, and the full list in
   [known gaps](tailwind-known-gaps.md).
2. **A context for every compile.** Vite, Metro and Next capture the
   project's CSS ([default order](tailwind-default-order.md)). A compile with
   no project -- the standalone compiler API, WASM, tests -- has no context
   and keeps authored order. Giving it one means shipping a built-in rule
   order (the portable snapshot is a 90-candidate test fixture, not that),
   whose payload budget RFC 007 §9 leaves open. That is a decision to make,
   not an implementation detail.

Until then, the useful consolidation is making the old path smaller: each
barrier graduated moves inputs off it, and this script measures how many.

## Progress

Re-run the script after each layer that graduates a barrier and record it
here.

| After | Ranked | Moved by |
| --- | --- | --- |
| This page | 256 / 320 (80%) | -- |
| [Transitions and font families](tailwind-transition-font-family-order.md) | 268 / 320 (83.8%) | `transition-colors`, `font-mono` |
| [Guarded classes](tailwind-guarded-class-order.md) | 283 / 320 (88.4%) | `cx(base, size === 'sm' && 'px-3')` |
| [Theme shadow tokens](tailwind-theme-shadow.md) | 288 / 320 (90%) | `shadow-hozo-surface` |
| [Grid and position](tailwind-grid-position-order.md) | 292 / 320 (91.3%) | `grid`, `fixed`, `row-span-2` |
| [ARIA states](tailwind-aria-state-order.md) | 296 / 320 (92.5%) | `aria-pressed:` |
| [Placeholder and resize](tailwind-placeholder-order.md) | 300 / 320 (93.8%) | `placeholder:`, `resize-none` |
| [Space](tailwind-space-order.md) | 308 / 320 (96.3%) | `space-y-*` |
| [Caret and accent](tailwind-caret-accent-order.md) | 309 / 320 (96.6%) | `accent-emerald-600` |

What remains, in order: `bg-brand` (not generated), and single cases (`backdrop:`, `placeholder-*`,
`animate-pulse`, `pt-[env(...)]`).
