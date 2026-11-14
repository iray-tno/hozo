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
  `@hozo/ui`'s tokens were also not-generated and the share was 69%. The
  script now adds the colour names of the examples' own `@theme` blocks too
  (see the progress table).
- The rest are real barriers, and the top ones are the next graduation
  candidates: `transition-colors` (several declarations), `font-mono` (font
  family), a theme shadow token, and `aria-pressed:`/`placeholder:`
  conditions.
- An earlier draft collected names through the candidate cache, which only
  sees runtime class strings, and reported 10.6% with most inputs
  `uncollected`. The script now uses the parser's own utility table
  (`inspectTailwindOrder`).

## Ordering outside the shared plan

| Responsibility | Implementation | Stage 6 treatment |
| --- | --- | --- |
| Tailwind rule emission and assessed cascade | Captured or built-in descriptors → `tailwind_order/comparison.rs` (emission) → `priority.rs` (importance, CSS specificity, then emission). `TailwindWritePlan` applies these ranks within each assessed input. | One authority. No per-backend or per-family rule comparator. |
| Web candidate stylesheet emission | Tailwind's upstream first-rule ordinals with a project hint; otherwise the shared built-in rule comparator over the scanned candidate's descriptors. CSS itself resolves specificity. | One rule-emission authority per context, not a declaration rank. A whole-candidate sort cannot prove multi-rule ordering. Verify final ordinary output, not bootstrap output. |
| Native assessed runtime candidates | `candidate/plan.rs` projects ranks onto emitted objects and real conflict keys. `class-resolver.ts` applies them on a class-string cache miss and selects state matches afterward. | Keep data projection and selection; neither may decide a new Tailwind priority. |
| Native static specificity and JSX composition | `plan_native_condition_groups` linearizes known weights when needed; unknown weight is not zero. `conditions.rs` preserves authored tiers and [ADR 011](../decisions/011-styling-inputs-keep-their-own-cascade.md) preserves input boundaries. | Keep, including for arbitrary/unranked and mixed inputs. Web needs no parallel weight sort. StyleX keeps its own atomic order; `twMerge` removes classes before ranking and is not cascade. |
| Native runtime fallback owner ranks | `builtin_owner_interaction_rank` uses the same selector weight as the static Native projection, plus the shared built-in variant positions; `class-resolver.ts` may sort these tuples when the string cannot use the complete plan. It leaves equal ranks in authored order and does not sort a group set containing unknown ranks. Fully ranked namespaces [no longer emit the fallback tuples](tailwind-order-old-path.md#omit-fallback-ranks-when-the-fallback-cannot-run). | Keep necessary specificity/selection. The variant tie policy is still observable on genuinely unassessed input. |
| Style projection after ordering | Logical edges, implicit line-height, register assembly (transform/filter/shadow/gradient), and authored style/spread precedence. | Keep semantics; never use these projections as a second utility-priority table. |

The parser interaction sort, Web condition-weight sort, duplicate owner
variant table and process-global switch have been removed. See the
[deletion receipts](tailwind-order-old-path.md). The distinction was
observable: with both hover and press active in Chromium and the same
facts applied to the emitted Native callbacks, the built-in path for
`active:p-2 hover:p-4 filter-none` selects 16px in static Web/Native but 8px
from the generated Native fallback. Reversing the first two tokens makes
both select 8px. Tailwind 4.3.3 generates `filter-none` and selects 8px in
both orders; Hozo treated that whole-property reset as a barrier.
Without it the assessed Hozo routes also select 8px in either order.
[The filter reset now ranks](tailwind-filter-order.md#whole-property-resets),
and all four paths select 8px in both orders. This does not prove equivalent
winners on genuinely unassessed input.

## Proposed Stage 6 gate (#1230)

Apply this per existing workstream. A point is earned by deleting the
superseded authority, not by renaming it or by shrinking the denominator.

1. **Authority audit:** zero independent production Tailwind precedence
   policies for the graduated domain. List every remaining rank producer
   and consumer, which input reaches it, and the removed code/table/route.
   A retained projection must not assign a different Tailwind winner for
   the same assessed input. CSS specificity and state delivery are not
   duplicate Tailwind policies.
2. **Independent differential:** on the same declared domain and pinned
   Tailwind, compare actual browser winners with static Web, selected
   Native styles and generated candidates, in both token orders and with
   overlapping conditions. Test captured and built-in contexts. Report
   zero unexplained winner differences; include a negative control that
   demonstrates the oracle catches a wrong winner.
3. **Fallback contract:** explicitly test known conjunction specificity,
   equal-weight authored ties, unknown/opaque input, unranked arbitrary
   writes and mixed Tailwind/StyleX/author tiers. Equivalent fallback
   inputs must not choose different winners because one reached a second
   Tailwind tie policy. An intentionally different composition tier must
   be named and tested, not treated as parity. Keep all existing refusals
   and the [stage-5 inventory](tailwind-order-inventory.md); report any
   new gaps, do not relabel them away.
4. **Ordinary delivery and cost:** prove production adapters actually use
   the verified ranks, including after a universe change. Run the existing
   Web/Native regression suites and the
   [read-only output receipt](tailwind-order-old-path.md#removing-the-process-wide-switch)
   for no-behavior-change deletions. No new runtime ordering code for
   static output, no sort/rank reads on state updates, and review any
   repeatable cold/build regression under [RFC 007 §7](../rfcs/007-canonical-tailwind-order.md#7-acceptance-and-performance-evidence-before-expansion).

This is a proposed acceptance gate, not a score change. A real Tailwind
capture of `bg-brand` from both a theme token and an `@utility` of that name
has ambiguous property ownership. Hozo emits a valid Native background
colour from the theme but does not give the write a rank. With hover and
press both true, `active:p-2 hover:p-4 bg-brand`
selects 16px statically and 8px dynamically; the opposite token order selects
8px on both. A known conjunction still wins on both paths. The static
emitters now preserve repeated guards for physical padding/margin and
opacity, so `hover:p-2 active:p-4 hover:p-6 bg-brand` selects the authored
24px on static Web and Native rather than 16px. The generated Native
resolver still selects 16px because of its variant tie. Register-dependent
inputs retain their grouping until each composer can consume separate
writes under the same guard. Reconcile those inputs before deleting the
reachable fallback tie. Preserve Native specificity; do not require all
arbitrary syntax to rank or force-delete a necessary operation.

In a diagnostic run using the real captured `bg-brand` barrier, masking
the variant bits off generated tuples (without changing production code)
made the runtime agree with static Native on four inputs: both orders of
hover/active, the repeated hover, and a more-specific hover/focus
conjunction. This is evidence for the next deletion, not register or mixed
input parity.

Web transform/filter, gradient, and shadow register detection now compares
the slots written by each emitted rule, instead of OR-ing writes under
equal conditions. Two separated rules can share a selector and still
need independent slots. This removes an assumption in Web projection;
it does not enable additional split runs or change Native runtime rank
selection. One-rule, same-slot, and raw-filter controls keep their
existing paths.

Native transform detection also compares the slots in emitted style
objects, no longer unioning them by guard. This lets unranked owner states
keep separate runs for two-dimensional translate axes. For
`hover:translate-x-2 active:translate-x-4 active:translate-y-5 hover:translate-y-3 columns-(--layout)`,
overlapping states now produce `16px 12px` in Chromium and in the emitted
Native callback, rather than `16px 20px`. A single run or objects writing
identical transform slots still use literal arrays. This does not alter
the Native fallback rank or widen run preservation to other registers.

Native filter projection now compares emitted objects too. For ordinary
filters it no longer copies the base into each condition before deciding
whether to compose. Equal slot masks still use literals; different masks
use the existing composer. A repeated hover after active can now preserve
the active `blur(24px)` and replace only `sepia(50%)` with `sepia(100%)` on
both static routes. An isolated base `filter-none` is also safe: it is
`none` before and after the states, and its rule has no slots to lose.
Guarded resets, base resets sharing resting filter slots, raw filters,
and drop shadows still block the expansion. Native animation frames and
slots without a composer keep their former grouping.

With the captured `bg-brand` barrier, masking just the generated variant
bits now agrees with static Native for the repeated filter runs in both
token orders, for a hover/focus conjunction, with an isolated base
`filter-none`, and with `hover:shadow-sm` and `hover:ring-2` even
when an active filter rule separates them. Plain outer shadows replace
one another. When all guarded shadow slots belong to one guard in one
input region, only those slots rejoin that guard's first rule. The
independent filter rules remain in order and Native retains its shadow
literal. With `active:ring-2` instead of `hover:ring-2`, Web and Native
now keep the slots separate where composition is available. Native uses
the shadow composer it already selected for this combination. Static
and the masked resolver both produce `sepia(100%)` for this probe; the
current resolver still produces `sepia(50%)`. Raw shadow and shadow
modifiers across authored inputs still block this expansion.

The same projection now preserves authored filter runs beside composable
gradient slots: a hover direction and first stop can combine with an
active last stop, without moving the final hover sepia. With the captured
`bg-brand` barrier, masking the variant bits agrees with static Native
on ten of ten focused probes, including `bg-none` at rest. The reset
keeps `none` without erasing independent gradient stops. A guarded
reset or a reset competing with a resting constructor is still a
barrier. Raw images, unsupported stops and conic gradients are outside
this proof. This sample is not the mixed-input deletion gate.

For the shorthand/logical/gap workstream, preserve authored runs for
gap and logical inline edges, which already emit independent values.
With the captured `bg-brand` barrier and overlapping hover/active, the
following compare emitted Native style keys, not Yoga layout:

| Input | Static before → after | Generated now | Generated without the variant tie |
| --- | --- | --- | --- |
| `hover:p-[11px] active:p-[17px] hover:pt-[23px]` | top 23 → 23 | 17 | 23 |
| `hover:p-2 active:p-4 hover:p-6 hover:gap-2` | top 16 → 24 | 16 | 24 |
| `hover:px-2 active:px-4 hover:ps-6` | start 16 → 24 | 16 | 24 |

Logical and physical padding still use different Native keys. Those
cases need effective-layout comparisons rather than asserting that
the flattened keys agree. StyleX and authored `style` also need their
real composition boundary: a generated class resolver by itself cannot
see either of those inputs.

The fallback gap geometry probe compares actual compiled Web CSS in
Chromium, the static Native callback in Yoga 3.2.1 WASM, and the
specificity-only diagnostic resolver in the same Yoga fixture. For each
of three lists it exercises four flex directions and LTR/RTL (24
observations per route). The two Native paths agree on 24/24. In the
`hover:gap-x-6 active:gap-4` order, however, the browser shows
`[16, 16]` and both Native paths show `[16, 24]` (row, column pixels).
Reversing the class order and repeating a single gap key agree. This
was a cross-key fallback mismatch, not one caused by masking the
variant rank. Native now emits both axis writes for every compiled
`gap`, through the same style writer for static objects and generated
candidates. Both Native paths now match Chromium on those 24 layouts.
A fourth case with an authored `style={{ gap: 28 }}` agrees on another
eight layouts, through the existing authored-style projection. This
does not change how raw authored Native style aliases resolve, and is
not a device-layout measurement.

The inline edge probe measures the related but distinct Native key
boundary. With both states active and `hover:ps-6 active:pl-4`, the
later physical write wins in LTR Chromium (left 16px), but Yoga keeps
the start write (left 24px). The margin counterpart behaves the same
way. Reversing authored order agrees in LTR; in RTL these two keys
target separate physical sides and agree in both orders. Across four
lists and two directions the compiled Web and selected Native style
objects agree in 6/8 layout comparisons. No change to RTL or the
Native style ABI is inferred from that comparison: a fix needs the
effective direction where the style is applied, including locally
overridden direction, rather than a global left/right swap.

For the next stage-6 checkpoint, verify the static authored guard runs
through the affected register and text-metric projections, then replace
the runtime tie with stable selector weight once both routes agree. Report
the deletion per domain with the ranked, barrier, and mixed-input controls
above; independently verify candidate sheet emission where a utility
emits multiple rules. A static-only repair is not a completed domain.

Absolute text metrics now preserve repeated owner guards. For
`hover:text-lg active:text-2xl hover:text-xl` beside the captured
`bg-brand` barrier, the authored 20px/28px wins when hover and press
overlap, rather than the coalesced 24px/32px. A Chromium reference with
the declarations in authored order, ordinary compiled Web, ordinary
compiled Native, and a generated Native resolver with only selector
weight agree across four inputs, both orders and all eight state
combinations (64 observations per route). This includes repeated
explicit leading and a more specific conjunction; the unchanged
production candidate resolver still selects 24px/32px for the first
overlap. No runtime or ranking behavior changed. The ranked
absolute-metric regression still uses real Tailwind's emitted rule order.

A mixed-input probe compiles a Text nested in a Pressable, with both
Tailwind/StyleX input orders, both authored guard orders, eight states,
and three caller/inline combinations (96 observations). The Web oracle
uses the official StyleX Babel output, Tailwind's actual caller CSS and
an authored-order reference for the unassessed static list. Font size
and tracking agree throughout, including explicit inline overrides.
Before mixed projection, Native line height disagreed in 48 observations: a caller's
`leading-6` writes 24px, but an active compiled size applies its 28px
or 32px default over it. CSS reads the caller's `--tw-leading` inside
that size rule. Masking the fallback variant tie cannot repair this:
the residual has no state-conditioned rank to mask. The two sources
need to preserve explicit versus default leading through composition.
Ordinary compiled Native now matches all 96 observations; the same
48 counterexamples remain when the mixed metric projection is disabled.
The projection restores the last explicit leading only when a later font
default would hide it. It runs only on mixed Native text/field sites with
compiled metrics, before authored inline style, and never inspects ranks.

An entirely opaque owner string is a different route: the Web candidate
sheet does not know the caller's token order. With the same `bg-brand`
barrier, real Tailwind and Hozo's captured Web candidate sheet choose
`text-2xl` for `active:text-2xl hover:text-xl` when both states hold, even
though hover was written second. Native's variant tie currently agrees
on that case. Removing the tie leaves 20px instead of 24px and also changes
the padding control. Separately, when both text utilities share the
same hover guard, `hover:text-xl hover:text-lg` yields 18px on the current
Native resolver and 20px on both sheets. The old rank cannot express
this same-guard utility order. Across five opaque cases the current
resolver differs in one, and the specificity-only ablation in three;
a positive conjunction still wins in both. The ablation is not a safe
replacement for the opaque route, even for absolute typography.

The generated resolver now keeps its existing common ranks when every
unassessed drawable token is a proven plain text- or background-colour
write and every other drawable token is assessed absolute text metrics,
physical padding or opacity. Both the captured rule footprint and the actual
Native projection must fit that boundary. A custom background utility
also writing font size, logical padding or `--tw-leading` is not admitted.
Multiple admitted colour writes (including duplicate tokens) retain
their fallback order relative to one another. This does not assign a rank
to a background or change the static authored fallback. No claim is made
about the winner between two unassessed colours on Web. Including
`hover:opacity-75 hover:opacity-25` alongside the text fixture now matches
Chromium at 0.75 in both orders; adding an out-of-scope margin candidate
still restores the legacy rank tuples for that namespace.

The proof uses the shared rule assessment to exclude validated hoisted
`@property` registrations, rather than mistaking them for selector-owned
writes. This admits ranked font-weight and absolute tracking in the same
scope: Chromium and Native both select weight 400 and tracking 2px for
the competing hover utilities in both token orders. Named font families
also keep their existing ranks across that barrier: with Arial and
Georgia as project tokens, `hover:font-serif` wins both permutations.
Tailwind's accompanying font feature and variation declarations are
still independent of the colour, but are not new Native output claims.

All five opaque cases now match Chromium for size, line height and
padding. Removing just the proof gives the previous 4/5, and also
masking the legacy variant tie gives 2/5. The proof is only read when
preparing a new class string; cached state selection uses the same
ordered template. The legacy tie remains reachable for potentially
overlapping or unproven writes, so this is not the Stage 6 exit.

Static authored fallback now preserves repeated guards for font weight
and named font family as well as absolute metrics. With an opaque columns
write and `hover:font-bold active:font-medium hover:font-normal`, the
combined hover/active state uses 400 rather than the earlier active 500.
The same check covers competing themed sans/mono/serif names. Both
compiled Web and Native selected styles match an authored-order CSS
reference in both token orders, for six state observations per route.
This leaves ranked input handling and Native arbitrary-family refusals
unchanged.

An overlapping `@utility text-brand` that also writes `--tw-leading: 41px`
exposes two separate gaps. With `hover:text-xl hover:text-lg` both token
orders give Tailwind **20px / 41px** (font size / line height) in Chromium.
Hozo's generated Web candidate CSS gives **20px / 28px** in both orders;
the generated Native resolver gives **18px / 28px** when `hover:text-lg`
is last and **20px / 28px** in reverse. Its `text-brand` candidate writes
only `color`. In a test-only ablation, retaining the assessed hover ranks
fixes font size in both orders but leaves line height at 28px. Removing the
custom register declaration restores the independent-colour proof and all
three routes give **20px / 28px** in both orders.

The overlapping case is not solvable by a different tie-break alone: the
capture records the declaration footprint but does not deliver the authored
register value. Keep it out of the independent-colour proof. Before retiring
the fallback for this domain, separate the known hover precedence from the
unassessed write without treating it as disjoint; supporting the custom
register itself would also require value projection or an explicit refusal
instead of silently counting it as a correct Tailwind winner. This receipt
changes neither routing nor the Stage 6 score.

The Native fallback now uses the assessed priority for adjacent implicit
font-size defaults under the same guard. Both token orders in the
overlapping-register fixture select **20px / 28px** without the rank
ablation. This only changes ties among those jointly selected writes. An
unranked state write, an explicit leading write, or a different effective
guard keeps its previous relationship to the run. State-only updates do
not read the priorities. The missing custom value and inter-guard fallback
are still open; this is a narrower production change, not the exit.

In a namespace whose only conditional writes are assessed font-size
defaults, Native now emits specificity without the built-in variant tie
bits. A resting barrier can still reach the fallback but cannot insert a
conditional style among those writes. Same-specificity hover and press
use the shared rank, while a hover/focus conjunction retains its higher
weight. With an additional non-size state writer the compiler still emits
the legacy tuples. This removes the tie from the bounded size-only route,
not from general mixed or unassessed input.

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
| The examples' `@theme` colours in the measured CSS | 315 / 320 (98.4%) | `bg-brand` (measurement, not code) |
| [Animations and placeholder colours](tailwind-animation-placeholder-colour-order.md) | 318 / 320 (99.4%) | `animate-pulse`, `placeholder-slate-400` |

Coverage counts this repository's own class lists. The
[inventory](tailwind-order-inventory.md) counts every Tailwind class and
variant by domain.

What remains: `backdrop:` (Native moves it to a dialog slot's unconditional
style, which needs its own proof) and `pt-[env(...)]` (an arbitrary
passthrough value).
