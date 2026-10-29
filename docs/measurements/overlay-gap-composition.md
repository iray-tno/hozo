# Overlay authored gap boundaries

Continues #1230 after the Toggle/Radio work in #1400/#1401. The existing
`hozoAuthoredStyle` now projects each explicit author before it is composed
with Native class axes at these public boundaries:

- Dialog panel style, before the View/scroll-content split.
- Popover root, actual trigger callback and mounted animated panel.
- Drawer root, actual scrim callback and panel.
- BottomSheet root, scrim callback, sheet, handle and optional handle bar.

The handle's non-resizable View and resizable Pressable both need the same
boundary. Projection stays inside a callback or mounted branch when that is
where the actual owner evaluates it. No new resolver, cache, provider,
subscription, public API, generated ABI, ordering policy or gap eligibility.

Safe-area padding still reads the original class/author contribution for its
padding calculation. Text still receives its original text-only split.
Translation/opacity, detent arithmetic, event handlers, presence, modal focus
restoration and the positioner's measurement mechanism are not changed.

## Evidence

The expanded actual-source Metro/candidate/Yoga matrix covers **76 distinct
public style props**, with **78 presentation cases** and **90 selected host
style channels** across 19 components. Four caller forms, three authors and
eight layouts give **8,640 rest observations**. The unchanged-source baseline
reproduced **800 mismatches**; the corrected boundaries leave **zero**.
The previous 5,376 interaction and 14,976 control/indicator observations
remain passing, including inactive/accessor/owner-refusal regressions.

Dialog is checked on both its plain View and actual
ScrollView.contentContainerStyle; the viewport is not credited for child gap.
The Popover panel must be the actual Animated.View. Both BottomSheet handle
host types are required. Exact host counts and original semantics remain.

An initial fixture wrongly imported Popover/Drawer/BottomSheet from core.
The import-resolves guard rejected it; these three now use their existing
patterns exports. No facade API is added, no production failure is inferred
from that setup mistake, and no claim that all literal callers fully AOT lower
is made. The setup log, corrected failing baseline and final logs are retained
under ignored `artifacts/tailwind-order/namespace-invariance/overlay-gap-*`.

CPU1/Idle/serial: pattern typecheck/build and **156 unit tests**, plus the
owner/input-slot/dynamic-slot/Native-host/source-cache command's **66 tests**,
pass without skips. The full candidate-cascade/Native-control files pass
**174 tests** (66.40s); the owner file also passes **7 tests** independently.
Lint, generated docs/metadata/ABI (58 leaves, 81 names), Native source receipts
and diff checks pass. Existing Turbo tasks already hash these pattern/engine
sources; no broad cache dependency is added for a narrow probe.

## Limits and follow-up

Yoga3.2.1WASM measures emitted effective gaps in fixed layouts, not complete
widget layout, Native pixels, trusted OS events, Fabric or AT. No new gap
browser differential, performance claim or headline compatibility/snapshot
change. The shared helper retains its existing no-gap identity path and
author-array flattening costs. No Rust change from the verified addon, full
local root suite, app/Metro/device build or report run. No changeset per user.

Actual overlay interaction, mounted/leaving/unmounted Popover authors and
conditional-handle reuse are a follow-up layer. Other owners, tier/gate
competition, resets/percentages/direct style functions, mixed StyleX and
contextual grid still precede canonical gap eligibility and old-path deletion.
