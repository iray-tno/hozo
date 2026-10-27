# Further direct-key Tailwind ordering

This layer follows the absolute text-metric work in #1355 and belongs to #1230.
It changes the shared CSS-write ownership definition, used by both static
backends and generated Native candidate plans. No runtime helper, provider,
subscription, cache-hit comparator or style composition is added.

## Boundary

Eligible writes now include supported direct display (`flex`, `none`,
`contents`), position (`relative`, `absolute`, `static`), combined overflow,
flex basis and wrapping, backface visibility, box sizing, isolation,
pointer events, user selection, supported vertical alignment and text
decoration line/color/style. Keyword values are bounded by the existing Native
representation. Original Tailwind rules still decide ownership, specificity
and emission order; this is not a second priority table.

Inline-flex/block contextual behavior, unsupported Native values, relative
text, gap/logical aliases, transforms and unassessed predicates retain the
whole input's old path. In particular, expanding gap to two axis keys without
also respecting explicit authored `style` would not prove Yoga/CSS equivalence.
Relative leading/tracking similarly cannot graduate while static folding and
generated candidates disagree about the inherited font size.

The policy advances to `scalar-order-v5` on both sides of the binding, and
the Metro regression rejects a validly hashed v4 transfer. Reusing an old
descriptor fingerprint must not silently reuse old output winners.

## Verification

Tests use actual captured Tailwind rules, both authored class orders, an
unrelated padding conflict, static Web/Native output and executed generated
Native maps. Browser comparison reads actual Tailwind computed values rather
than trusting the parser or a hand-maintained expected winner. Explicit
style/composition/state coverage from the preceding layers remains in place.

An initial fixture assumed arbitrary `[direction:rtl]` was already parsed to a
supported write. The actual candidate had no emitted groups, and the test
failed. Direction is not added by this layer; that observation is retained,
not reclassified as flaky or silently counted as coverage.

Final local results: workspace Rust **1,076 passed / one intentional ignored**,
workspace Clippy all targets with warnings denied, fresh Native addon and
compiler/Tailwind/Metro builds; Tailwind **150**, compiler **358 / one existing
skip**, Metro **93**, Vite **62**, Next **21**, full browser composition **35**
and Native fixture/cache guards **16** passed. The direct-projection browser
test increased from **64 to 124 observations**, adding 60 comparisons for the
new cases across both class orders and both reference/compiled Web elements.
Lint checked 1,736 files; generated docs and formatting/diff checks passed.

Local checks run CPU 1/Idle/serial. The full root JS/pack/app suite and real device smoke
remain CI work. Regenerating the Native fixture source receipts is not fresh
device evidence. No new conformance percentage or whole-app speedup is claimed.
