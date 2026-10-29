# Overlay gap authors follow their actual owner's lifetime

Test-only follow-up to [overlay composition](overlay-gap-composition.md),
continuing #1230. No production component, resolver, ABI, ordering policy or
gap eligibility changes in this layer.

## Actual interaction owners

The retained owner-handler matrix now includes Popover's trigger, Drawer and
BottomSheet scrims and BottomSheet's resizable handle. The single-detent
handle is a decorative View and is deliberately not credited with hover or
focus handlers it has no way to receive. Twelve real interaction owners,
four caller forms, three authors, seven frames and eight layouts give
**8,064 interaction observations**, all equal to the independent expected
axes. No-author controls change with hover/press/focus; generic/nested authors
remain authoritative. No fabricated resolver facts replace actual handlers.

## Mounted panel author

All four caller forms open/close/reopen an actual uncontrolled Popover through
its trigger. A frozen accessor-valued panel author throws if inspected while
the panel is unmounted. It is unread initially and after completed exit, even
when the closed parent rerenders. Opening projects its current value, closing
with a changed value updates the still-mounted leaving panel, and reopening
uses the next changed value rather than a cached projection. Reading the
rendered projected style does not invoke the original getter again.

Leaving retains a panel but makes it non-interactive/AX-hidden and removes
modal isolation. Only the recorded Animated exit completion unmounts it.
Notifications must be `[true, false, true]`. The animation completion is
explicitly driven by the existing host stub: this is not animation timing,
frame, native-driver execution, anchor-measurement or visible-portal evidence.

## Conditional handle and measured geometry

BottomSheet switches its actual handle View -> Pressable -> View, using the
same caller styles across each update. The resizable handle cycles both
detents through its real onPress; the sheet's actual onLayout reports 400px,
and the final translation must remain 0 -> 200 -> 0px. Root, scrim, sheet,
handle and bar each keep their distinct authored gaps and exact host markers.
Five frames, five slots, four caller forms, three authors and eight layouts
give **2,400 additional observations**, with no mismatches.

The first fixture chose a 48px root gap, which fits only one 50px child in the
fixed 140px Yoga oracle. That invalidated the two-on-first-line geometry used
to infer gaps; it was not a production mismatch. Distinct fixture gaps now
stay below the 40px topology boundary (12/20/28/32px). The failed probe is
retained under ignored `artifacts/tailwind-order/namespace-invariance/overlay-gap-lifetimes-*`.
Production output was unchanged; corrected-fixture comparisons remain strict.

## Retained evidence and limits

The owner file passes **9 tests**, including the existing 8,640 rest and
14,976 control/indicator observations, mixed-checkbox, inactive-accessor,
owner-refusal and delegated-thumb regressions. The combined owner/input-slot/
dynamic-slot/Native-host/source-cache command passes **68 tests**, no skips;
lint, generated docs/metadata/ABI (58 leaves, 81 names) and diff checks pass.
CPU1/Idle/serial. Yoga3.2.1WASM
and React stand-in hosts are not whole-widget Native pixels, trusted OS event
delivery, Fabric, AT or performance evidence. No fresh gap browser
differential, full local root/app/Metro/device/report run or compatibility
headline change. No Rust change or changeset (per user instruction).

Other owners, cross-tier/gate competition, resets/percentages/direct style
functions, mixed StyleX and contextual grid still precede whole-gap
eligibility and legacy deletion. No six-group migration family is closed.
