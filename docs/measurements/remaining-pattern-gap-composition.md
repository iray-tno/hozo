# Further pattern authored gap boundaries

Continues #1230 after #1404/#1405, without changing canonical gap eligibility,
the generated ABI, class ordering or the six-group migration's completion.

## Composition owners

The existing authored-gap projection now covers 13 public StyleProp inputs on
Tree (root/rows), Toolbar, Tooltip, Alert, Splitter, ResizablePane
(root/pane/handle) and Accordion (root/section/trigger/panel). The shared
Splitter Handle owns the delegated pane handle, so these are 12 direct helper
placements, not a second parent projection or resolver.

Accordion's panel projects the author before its box/text split; projecting
the already-mixed result would preserve the wrong class axes. Its heading
classes and trigger classes share one Native header owner and caller style.
Trigger text is still a separate contribution. Tooltip's floating style stays
inside its mounted branch. Tree indentation/marker callbacks, geometry, text
inheritance, selection, expanded state, announcements, constraints and handler
algorithms are unchanged. Class-only decorations get no new author helper.

## Reproduction

The real-source Metro/candidate/Yoga matrix now covers **89 distinct public
style inputs, 93 presentation/class-source cases and 106 selected host/style
channels** across 26 components. It includes expanded Tree rows, both Accordion
header class sources, the actual floating View and delegated adjustable
handle, with exact host/role/size checks. Four caller forms, three authors and
eight layouts give **10,176 rest observations**. The unchanged-production
baseline reproduced **1,024 mismatches**; the helper boundaries leave **zero**.

Toolbar's fixture supplies a Text element, not a bare string inside its View.
The corrected failing baseline is retained alongside the initial run. Public
imports are the packages' actual exports; no API or facade export is added to
make a fixture resolve, and literal callers are not blanket AOT claims.

The existing 8,064 interaction, 14,976 control/indicator and 2,400 conditional
handle observations remain passing, along with mixed-checkbox, owner-refusal,
inactive-accessor, panel-lifetime and delegated-thumb regressions. The owner
file passes **9 tests**, no skips; pattern type/build and **156 unit tests**
pass. Related owner/input-slot/dynamic-slot/Alert/host/cache checks pass
**70 tests**; full candidate-cascade/Native-control files pass **174 tests**
(67.39s), no skips. The Native-only Splitter regression passes **1 test** with
mock hosts (its Web case is not run by that filtered command). Lint, generated
docs/metadata/ABI (58 leaves, 81 names), Native source receipts and diff checks
pass. Existing source-cache globs cover these owners and the shared helper.

## Limits

CPU1/Idle/serial. Fixed Yoga3.2.1WASM layouts and Native stand-in hosts do not
prove whole-widget layout, native pixels, trusted OS events, Fabric, AT or
performance. The helper's existing no-gap identity path and author-array
flattening cost remain. No new resolver, subscription, memoization or runtime
rank sorting. No Rust change from the verified addon, full local root suite,
app/Metro/device/report run or compatibility headline/snapshot change. No
changeset per user instruction.

This does not claim every pattern/helper is finished: CodeBlock and its copy
helper are outside this slice. Other packages, direct callbacks, cross-tier/
gate competition, reset/percentage values, mixed StyleX and contextual grid
still precede whole-gap eligibility and legacy removal.
