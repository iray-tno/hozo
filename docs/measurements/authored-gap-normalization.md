# Authored gap normalization: preserve Native semantics on Web

This records the first Web-side slice. The following
[Native composition slice](./native-authored-gap-composition.md) resolves the
bounded compiled-root/spread discrepancies recorded below; broader gap
ordering and fallback/slot work remain open.

The first fix following [the gap boundary measurement](./tailwind-gap-alias-boundary.md)
aligns the interpretation **within the author's inline StyleProp**. It does
not yet fix class-axis/inline-generic composition on Native or admit gap to
the canonical ordering plan. No new headline conformance rate is claimed.

## Contract and implementation

An authored React Native style object is not a CSS declaration list. With
`{ rowGap: 8, gap: 24 }`, Yoga uses an 8px row gutter whichever key is first.
Flattening nested StyleProp arrays first retains that same rule across array
members. On Web the later CSS shorthand previously erased the axis instead.

The DOM-style normalizer now projects the **already flattened author's**
generic gap to effective row/column values. Existing non-null axis values
win; null/undefined axes fall back to a defined generic gap. Zero remains a
value. The projection mutates only the normalizer's owned flat object, never
the source object/array; accessors are read once by the existing flatten step.

The small projection lives in `packages/engine/src/authored-gap.ts` so the
Native composition follow-up can use the same rule. It is not a new public
API, generated-code leaf, state provider, sort or subscription. A no-gap
inline style does not call it, and compiled elements without explicit style
are unchanged.

Only nonnegative finite numeric gaps and simple percentage strings are
projected. CSS-only values such as `8px 16px`, `var(--spacing)`, `calc(...)`
and `normal`, plus invalid/non-finite values, retain the previous behavior.
This does not invent Native support for those values or establish percentage
pixel equivalence. Native's own StyleProp interpretation is unchanged.

## Evidence

- Final engine build/typecheck and **90 engine tests** passed. A combined
  engine/Yoga/raw-source-cache selection passed **104 tests**. Tests cover
  both object orders, nested arrays, null/undefined fallback, zero, percent
  value preservation, frozen objects and single accessor evaluation.
- The complete real-browser composition file passed **38 tests**, no skips,
  in **84.75s**, CPU 1 / Idle / serial. The gap matrix now has **480 browser
  observations**: raw CSS input, independently specified Native-shaped CSS
  reference and actual compiled output. The raw control is retained rather
  than rewriting away the previously observed browser shorthand behavior.
- The same **320 static/dynamic Native Yoga layouts** now contain **96**
  known class/inline mismatches, down from128. The32 within-authored-input
  discrepancies are fixed; the3 class/inline scenarios are still explicitly
  expected discrepancies, not support. Counts include both class orders and
  eight direction/layout combinations, not unique API features.
- Native styles and the resolver were not changed. The VM executes the
  actual generated output with the real DOM-style helper; the independent
  CSS reference only spells the reviewed axis-priority meaning explicitly
  for the axis-before-generic inline case. This is real browser/Yoga geometry,
  not fresh RN/Fabric, native pixels or accessibility evidence.

## Cost

Reproduce the isolated same-process ablation against parent `0cfc025c`:

```sh
node packages/engine/scripts/measure-dom-gap.mjs --baseline=0cfc025c
```

The script bundles each DOM normalizer, checks equivalent output on unchanged
inputs, warms both, alternates nine100,000-call sample pairs and prints **all**
samples. It does not compare changed gap semantics as equivalent or measure a
whole app, device renderer or memory. CPU1/Idle throughout.

| Unchanged input | Parent median | Final median |
| --- | ---: | ---: |
| No-gap object | 0.6861 µs | 0.6863 µs |
| No-gap nested array | 1.3877 µs | 1.3632 µs |
| CSS-only gap string | 0.7077 µs | 0.7729 µs |

Treat the first two differences as small-sample noise, not a speedup claim.
The CSS-only path adds about0.065µs in this isolated run. Minified isolated
CJS bundle:4,061→4,337 bytes; gzip1,620→1,736 (**+116 bytes**). This is not
the app bundle or a Native payload increase.

The initial implementation called the projection on every normalized style
and added about0.15µs to no-gap inputs. The final source guards the call before
entering the helper and defers the own-key check until a valid generic value
is present. All initial/intermediate/final samples remain under ignored
`artifacts/tailwind-order/namespace-invariance/authored-gap-cost*.json`; these
are source revisions, not retries of a failing result to select a fast run.

## Next

The first CI run40667453388 failed one ScrollView assertion that matched the
old serialized `gap:8px;padding-left:12px` text. The revised test compares the
viewport and content style maps separately, including both8px gap axes and
12px content padding, without depending on CSS declaration order. All85
primitives tests passed serially from their package directory. A prior local
invocation from the repository root passed the repaired ScrollView test but
failed an unrelated Link bundling probe because that probe requires package
cwd; both outputs are retained. No production code, timeout or expected style
value changed for this CI repair.

Keep the author contribution separate when composing it above compiled and
candidate class styles on Native. Reuse this projection after resolving that
contribution, not after flattening it together with class axes. Generated
spreads, function styles and fallback/slot owners must share that boundary.
Only then expand gap ordering eligibility and remove its legacy barrier.
