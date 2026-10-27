# Tailwind ordering: local ranks, shared winners

## Question and scope

Must every transformed module wait for the final bundler graph to share one
numeric rank namespace? No, for the currently assessed scalar domain under
one captured stylesheet/theme/Tailwind epoch. A complete module context can
produce ordered styles without exporting its ranks. A generated resolver can
compare ranks inside its own complete map. Never combine numeric ranks from
different maps or assume their fingerprints match.

This is narrower than arbitrary CSS cascade equivalence. It does not expand
support for multi-rule utilities, important declarations, unknown predicates,
logical properties, register-based utilities or cross-input sorting. Existing
assessment barriers and input-composition contracts remain authoritative.

## Why candidate insertion does not require re-emitting older output

The common comparator uses upstream variant bitsets, original property-order
signatures, declaration counts and candidate-name tiebreaks. Assessed
importance/specificity precede this sequence. Under a fixed design system,
adding unrelated candidates may insert variant positions and rank entries;
it does not reverse the order of already-observed variants. Inserting bit
positions monotonically preserves the highest differing bit and therefore
the comparison of two existing bitsets. Other existing-rule comparison facts
remain unchanged. Restricting the larger order to the smaller candidate set
therefore preserves their relative order, although the numbers change.

The static planner erases those ordinals into ordered writes. The runtime
resolver receives one complete generated map, sorts a class string on its
cache-fill path and never compares its ordinals with compiled static styles.
Mixed inputs continue to use their composition tiers, not cross-map rank
comparisons. This reasoning does not authorize rebinding a prepared module
to incomplete descriptors, retaining output across CSS epochs, or merging
independently generated resolver tables.

## Measurements

Reproduce serially after building the current compiler addon and packages:

```sh
pnpm --filter @hozo/tailwind exec node --test --test-concurrency=1 src/namespace-invariance.test.ts
node --test --test-concurrency=1 --test-name-pattern="generated common-plan resolver" examples/storybook-demo/scripts/caller-composition.test.mjs
```

The namespace test uses eleven actual class expressions, both class orders,
32 owner-state combinations, physical spacing, dimensions, colors and
deliberately unassessed neighbors. It compares actual Web/Native emission and
evaluates the generated Native resolver, not a hand-written priority model:
**704 style-value comparisons** agree. The expanded namespace adds 160
utilities and sixteen kinds of variants. Assertions require both numeric
ranks and actual upstream variant masks to change, so equal output is not
explained by identical contexts. Both tests passed (no skipped tests).

The second test restricts actual upstream rule order back to the smaller set.
Changing the stylesheet spacing from `.25rem` to `.5rem` changes the winner's
value from 16px to 32px and its receipt. Explicit legacy pass-through emission
is a negative control with a different winner.

The focused browser test passed against actual Tailwind CSS. It compares a
local generated resolver with a larger completed batch after adding 128 margin
candidates and more variants. It requires different fingerprints and an
actually changed `p-4` rank, and checks static Web/Native results and browser
owner-state transitions with reversed class strings.

These are bounded regression evidence plus comparator reasoning, not proof
of all custom Tailwind rule shapes or performance measurements. Logs are
local artifacts under `artifacts/tailwind-order/namespace-invariance/`.

## Consequence for adapters

The Vite whole-graph shadow publication measured in
[the previous probe](vite-final-style-graph.md) is not a prerequisite for
activating this bounded domain. Its second style emission and retained graph
should leave the default build path. Publish ordered CSS during the ordinary
transform, before the bundler consumes its companion import. Metro's actual
static transforms and generated dynamic resolver must switch together;
Next uses the same project-session policy. Validate delivered assets,
mixed/static/fallback winners, cache reuse and configuration replacement
before activating defaults. This measurement layer itself changes no defaults.
