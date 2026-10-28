# Gap aliases: ordering is not yet platform equivalence

This records the original #1369 observation. The current probe also retains a
raw CSS-inline control and now covers the first paired authored-inline fix;
see [authored gap normalization](./authored-gap-normalization.md). The original
128 mismatches below are historical, not the current probe's expected count.

This is boundary evidence for #1230, not new support or a passing gap-parity
claim. It does not admit `Gap`, `RowGap` or `ColumnGap` to the shared scalar
plan, change output, or remove a legacy barrier. The existing paths already
diverge in these cases; retaining a barrier does not repair that divergence.

## What was measured

- Actual captured Tailwind descriptors, emitted Web CSS and static Native
  styles, and an executed opaque-class component using the generated candidate
  resolver. No hand-written substitute for the generated style selection.
- Tailwind's own CSS and the compiled Web host measured in headless Chrome,
  with inline styles serialized by React DOM. Child rectangles, not a parser's
  predicted CSS values, determine the row/column gaps.
- The selected Native style objects laid out by upstream `yoga-layout` **3.2.1**
  WASM, pinned in the root's development dependencies and lockfile. It is not a
  production dependency. This is real Yoga, but **not** the Yoga binary bundled
  in RN 0.87.1 and not a device, Fabric, accessibility or pixel test.
- Ten curated cases, both authored class orders (including repeated one-class
  controls), four flex directions and LTR/RTL: **320 browser observations**
  (reference/compiled), plus **320 Native layout observations** (static/dynamic).
  Of the latter, **128 disagree** with the browser reference as expected by
  this boundary test. These are observations, not distinct supported features
  or a coverage denominator. A future paired fix must replace these explicit
  divergence expectations with equality, not silently continue counting them.
- Sixteen additional layouts reverse the Yoga setter order; sixteen compare
  compiled-only expansion with an experimental all-axis control.

All local verification uses CPU 1, Idle priority and serial Node tests. The
initial focused probe failed because its VM omitted the generated Web
`hozoDomStyle` dependency. Wiring the real helper repaired the measurement;
no production behavior or expected geometry was changed for that failure.

The smallest examples below give `[row gap, column gap]` in pixels:

| Class input | Explicit inline style | Browser | Yoga |
| --- | --- | --- | --- |
| `gap-[16px]` | none | `[16, 16]` | `[16, 16]` |
| `gap-y-[8px]` | `{ gap: 16 }` | `[16, 16]` | `[8, 16]` |
| `gap-x-[8px]` | `{ gap: 16 }` | `[16, 16]` | `[16, 8]` |
| `gap-[16px]` | `{ rowGap: 24 }` | `[24, 16]` | `[24, 16]` |
| `gap-[16px]` | `{ gap: 24 }` | `[24, 24]` | `[24, 24]` |
| `gap-[16px]` | `{ rowGap: 8, gap: 24 }` | `[24, 24]` | `[8, 24]` |
| `gap-[16px]` | `{ gap: 24, rowGap: 8 }` | `[8, 24]` | `[8, 24]` |

The two final rows also expose an authored-inline alias difference, not just
compiled class ordering. Do not solve one by declaring the other equivalent.

## Why

RN 0.87.1's installed source was inspected as a separate check:
`Libraries/StyleSheet/flattenStyle.js` keeps different object keys when
flattening a style array; `ReactCommon/yoga/yoga/style/Style.h`,
`computeRowGap`/`computeColumnGap`, prefers a defined axis gutter to `All`.
The headless Yoga results agree with that source-level mechanism. This does
not establish exact device-version equivalence.

Thus `[{ rowGap: 8 }, { gap: 16 }]` retains both keys. Reordering that array or
Yoga's setters does not let the generic gutter beat the axis gutter. CSS
instead lets the inline shorthand write both longhands, above class CSS.

Expanding **only compiled** `gap: 16` to `{ rowGap: 16, columnGap: 16 }` is
also unsafe: an opaque caller's later `{ gap: 24 }` then loses on both axes.
The test requires that counterexample as well as a working all-axis control.

## Next implementation boundary

Keep decisions [009](../decisions/009-a-callers-class-sits-between-rest-and-state.md) and
[011](../decisions/011-styling-inputs-keep-their-own-cascade.md): explicit style wins over
class tiers; each class input retains its own upstream ordering.

The next slice should establish one shared **gap projection/composition
contract**, rather than another per-component sorting table:

1. At build time, retain original gap/axis write ownership and assessed rule
   order; project utility writes to the same row/column slots for static and
   generated candidate output. Neither source order nor Yoga alias precedence
   substitutes for the upstream rule plan.
2. Resolve the author's explicit StyleProp as **its own contribution**, then
   compose its effective gap slots above all class tiers. Preserve RN's
   within-StyleProp alias behavior on both platforms; in particular, do not
   flatten the caller together with compiled axes before deciding who owns a
   write. Web's existing DOM-style normalization is the paired boundary.
3. Use a shared composition operation for generated output and fallback/slot
   owners, driven by the style contract rather than component-name guesses.
   Static objects should be prepared once; opaque inline values may need
   bounded runtime normalization. Do not add a runtime rank sort, provider,
   subscription, or an unconditional scan of every owner's compiled styles.
4. Before enabling the family, verify nested arrays, function styles, spreads,
   getters evaluated once, absent/null values, percentages, class/caller/state
   tier conflicts, StyleX composition, reused styles and RTL. Measure the
   no-gap fast path and cold/cached costs. The current fixed-pixel probes do
   not establish these cases; APIs and any cache strategy remain to implement
   and measure.

These are implementation requirements, not an assertion that an unmeasured
normalizer is free or already correct. Logical edges and transform registers
remain separate families; no generalization is earned by this gap experiment.

## Reproduce

```sh
node --test --test-concurrency=1 packages/tailwind-conformance/src/gap-alias-reference.test.ts
node --test --test-concurrency=1 --test-name-pattern='gap alias boundary' examples/storybook-demo/scripts/caller-composition.test.mjs
```

The browser is required in CI and must be installed locally for that second
command; a local skip is not browser evidence. The usual compiler/engine/
Tailwind workspace builds must already exist. No new headline snapshot is
generated, because this PR changes neither production behavior nor measured
support classification.

Final verification on this layer: the focused Yoga/reference/cache-input
selection passed **22 tests**; the complete real-browser caller-composition
file passed **38 tests**, no skips, in **80.99 seconds**, including the final
320-observation gap case. Package metadata and generated documentation checks
passed. No Rust source changed, so the existing final parent addon was reused;
there is no claim of a new addon, full root suite, app build or device run.
