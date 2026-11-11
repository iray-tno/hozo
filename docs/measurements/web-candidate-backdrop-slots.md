# Web candidate backdrop-filter registers

Part of #1230, following [ordinary candidate filters](web-candidate-filter-slots.md).
No ordering, default-route or Native admission change.

Runtime blur, opacity and saturation used to emit separate whole declarations.
The last declaration replaced the other functions. Candidates now share the
static split writer: each function sets a slot, and both backdrop-filter
spellings read the same ordered chain. The prefixed reader is also emitted for
split static output, matching the existing literal path.

The candidate sheet registers only the nine non-inheriting backdrop slots.
Using both filter families registers their 17-slot union; unrelated sheets
still emit none. Whole-chain resets and drop-shadow forms keep their
existing path. No browser JavaScript was added.

The two new declaration assertions failed with the parent addon and passed
after rebuilding. Web Rust: 226 passed. Scoped compiler tests: eight passed.
The Storybook browser fixture compares actual Tailwind and Hozo through
reversed input, hover, focus, stacked states, descendant isolation and
sheet removal/restoration. Browser execution is remote-only.
