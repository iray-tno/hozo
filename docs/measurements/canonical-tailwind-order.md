# Canonical Tailwind order: reference before implementation

Tracking #1230; design [RFC 007](../rfcs/007-canonical-tailwind-order.md).
The before source is main `99e9c03a61aaa80c86893fbea72c25df431f86ce`, not #1237.
No production ordering changes are introduced by this reference layer.

## Reviewed reference

`packages/tailwind-conformance/src/tailwind-order-corpus.ts` is a small,
versioned adversarial workload, not a coverage denominator. Fifteen browser
cases cover numeric ties, shorthand/axis/side spacing, width, radius, colors,
font size/leading/slash/weight and overlapping hover/active. Reversed strings
and LTR/RTL give 60 independent expected-value comparisons. They exercise the
real Tailwind stylesheet, not a sort written for this test.

Additional descriptor-only probes include alpha modifiers, prop/ARIA/data,
responsive/dark, logical sides and a placeholder selector. These are not new
Hozo support claims. A CSS-only repeated custom utility deliberately produces
two separate rules, so a first-rule class rank cannot masquerade as all of its
rule metadata. No project JS/plugin is loaded for this controlled probe.

The checked-in generated fixture pins Tailwind 4.3.3, theme/corpus hashes,
class-first-rule order and each rule's original property signature, count and
selector/at-rule structure. It is test evidence, not production ordering data.
The compact generated JSON has a narrow formatting exclusion; its exact bytes
are independently regenerated and asserted by the conformance test.

```sh
node scripts/tailwind-order-reference.mjs --check
node --test --test-concurrency=1 packages/tailwind-conformance/src/tailwind-order-reference.test.ts
node --test --test-concurrency=1 --test-name-pattern='canonical-order reference' examples/storybook-demo/scripts/caller-composition.test.mjs
```

To deliberately change the corpus/reference, regenerate without `--check`,
review the fixture and browser expectations, and record the reason. A Tailwind
upgrade must update the explicit version as well. A missing browser fails in
CI; a local skip is not successful browser evidence.

## Next evidence, deliberately separate

Measure actual current Hozo output against this reference without pretending
known divergences pass. Record static Web, selected Native styles and generated
candidate routes separately. Keep compiler/cold-resolution/cache/state costs
and generated payload size separate from browser correctness. Timings are
descriptive repeated samples, not flaky PR clock thresholds. No baseline in
this first layer measures application bundles, Native pixels/AT or IR memory.
