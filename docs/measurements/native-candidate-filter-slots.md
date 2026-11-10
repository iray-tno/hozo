# Filter composition in the Native candidate map

Continues #1230 / RFC010 §7C after
[static conditional filter composition](native-conditional-filter-slots.md).
No text/owner default, admission, audit promotion or ordering policy change.

## Failure and repair

The old map emitted `blur-sm` and `sepia` as two whole `filter` strings.
Resolving both retained only the last string. Before rebuilding the addon,
the new regression reproduced `sepia(100%)` instead of
`blur(8px) sepia(100%)` on the previous main implementation.

The generator now reuses the same IR-to-slot metadata and `hozoFilterStyles`
leaf as static Native boundaries. It indexes the actual unconditional and
state style objects once, at module initialization. Resolution queries only
the selected styles, never the project-wide map. Unconditional results retain
their existing cache, and a selected list without filters bypasses the helper.
A namespace with no assessed filter functions emits no filter import/table.

Filter composition runs before the existing text-metric and transform
composition. It preserves original style identities for those other maps.
No state subscription, runtime class parser or new precedence authority is
introduced. The resolver's existing ranks and authored barrier controls decide
which selected writes win; the helper joins their function registers.

## Limits retained, not partially approximated

Drop-shadow size/colour is not assessed by the new metadata. If an actual
selected style writes an unassessed whole filter, the entire filter chain
retains its previous last-object behavior. Transform/text composition still
runs. Merely scanning an unused drop-shadow does not disable other chains.

This is Native candidate-map evidence, not a fix for Web candidate filters,
drop-shadow registers, filter animation endpoints, mixed static/dynamic
contributions, or Native runtime `md:`/`dark:` admission. The latter remain
diagnosed as before. No unsupported syntax is newly admitted.

## Receipts and cost

`packages/compiler/src/candidate-filters.test.ts` executes actual generated
modules: reversed class order, caching identity, hover/focus/stacked states,
deactivation, reset revival, text/transform coexistence, selected versus
merely scanned drop-shadow, filter-free maps and the compiled dynamic
Pressable callback. An identity-composer negative control still loses a
function. The Tailwind reader test now checks both static expressions and
runtime state maps against eight actual upstream function writers and order.

CPU1 / Idle / serial, Node25, debug addon: the two-function generated module
is 936 raw / 433 gzip bytes (excluding the already-shared 350-gzip-byte
helper). A plain `p-4` + `hover:opacity-50` namespace is 500/290; adding
`blur-sm` + `hover:sepia` makes it 1204/538. That comparison includes the
additional candidates, not only wiring overhead.

For 50,000 warmed state resolutions: plain list in the plain map 27.37ms;
the same plain list in the filter-bearing map 30.33ms; active filter chain
58.56ms. Checksums are 100,000 / 100,000 / 150,000. These are single local
Node loops with selected styles and preindexed metadata, not a production
benchmark, rendering/frame-time result or statistical regression threshold.
