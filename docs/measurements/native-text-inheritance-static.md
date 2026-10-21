# Native text inheritance: production static selection

Bounded comparison: [#1146](https://github.com/iray-tno/hozo/issues/1146).
Fixture source: `9fd5e5bc4031ab69e563fd11652c316996e1c97c` ([#1147](https://github.com/iray-tno/hozo/pull/1147)).
This is a bounded rendering review, not default rollout or acceptance of RFC 006.
The [earlier four-panel report](native-text-inheritance-production.md) remains
historical evidence for the runtime-only production path.

## What changed in the comparison

The v3 fixture keeps ordinary RN Text, an independent private reference,
private proof-selected Text and the shipped runtime-only production path.
A fifth panel uses the real internal compiler/Metro selection
`{ textInheritance: true, textStatic: true }`. Preparation compares actual
emitted output: the complete static case is exactly ordinary lowering; the
runtime and opaque cases are exactly the production runtime fallback.
An unexpected third output fails preparation rather than being classified
from the case name or private proof.

The fifth factory takes no replacement Text. Its hygienic namespace alias
retains the actual RN export through ordinary Metro without re-lowering the
already-compiled factory. Both production modes retain shipped View owners.
In the opaque cross-file memo/View case, contextual labels receive no frame
or style prop. Ancestor changes must cross the memo bailout; a local override
must shield the label, and removing it must resume inheritance.

Mock-host checks observe zero inherited Text helpers in the fifth static
case and two in its runtime fallback. Device pixels check rendered output,
not helper counts or Fabric commits. The target combines seven properties
(size, weight, line height, tracking, alignment, transform and color) with
nested blue text; it is not exhaustive per-property conformance.

## Android: independently reviewed

The Android job in [39494512361](https://github.com/iray-tno/hozo/actions/runs/39494512361)
passed at the fixture source above, using a fresh APK, diagnostics off,
React 19.2.3 / RN 0.86.3 and the isolated `text-inheritance` scenario.

The existing offline reviewer independently read **all 70 raw PNG/AX pairs**,
verified marker/state/mount identities and absolute Text bounds, recomputed
RGBA hashes and regenerated the expected sequence: **121 comparisons,
111 exact equalities, ten intended ancestor changes, 84 acknowledged actions**.
It does not reuse the driver's crop/AX helpers or accept saved pass flags as
proof. Corresponding panels have equal same-OS Text-region pixels without
translation, resizing, blur or tolerance. All retained states had one capture;
no failed capture was discarded in favour of a later successful one.

Static Text crops remain 630 x 252 px. Runtime/opaque crops are 630 x 252 px
at rest or under local override, and 630 x 315 px after ancestor changes or
override removal. Mount tokens stay stable within each case. Tokens and
layout callback counters are not native host-mount or performance measures.

Five fifth-panel screenshots were also visually inspected: `static-initial`,
`runtime-ancestor`, `opaque-override`, `opaque-unoverride`, `opaque-restore`
(the `-production-static-1.png` files). They show the complete wrapped target,
root/nested colors, ancestor size/case changes, local shielding and restored
inheritance. This visual subset is separate from the numerical review of all
70 captures; not all screenshots were individually viewed.

Actual downloaded APK bytes match evidence and signing metadata:
SHA256 `591a665b721a581209689a24918f63f2cdacb0923af94a912c4bb072cc48f0fa`.
Signing is `debug-preview`, not release. This is a byte/provenance check, not
an independent certificate audit. Manifest v3 matches local preparation,
including runtime source hashes, selection/proof inputs and emitted outputs.
The source commit pins the entire harness, not only the named manifest inputs.

## iOS: original setup failure retained

The same dedicated run **failed overall**. iOS stopped in `Begin exact iOS
Simulator boot during native build`: `xcrun simctl list devices available
--json` produced no stdout/stderr and timed out after 120,049 ms against its
unchanged 120-second budget. `simulator-preparation.json` records
`completed=false` and `ETIMEDOUT`. App compilation and the Text comparison
were never reached. This is not an observed glyph mismatch, and the
underlying CoreSimulator/host cause has not been established.

The same-source automatic full Showcase run
[39494451216](https://github.com/iray-tno/hozo/actions/runs/39494451216)
passed both OS jobs. It does not run this isolated five-panel comparison and
is not counted as its rendering evidence.

One explicit iOS-only follow-up,
[39533271406](https://github.com/iray-tno/hozo/actions/runs/39533271406),
was started on a dedicated measurement ref at the **identical source**.
It uses a fresh app, diagnostics off, `text-inheritance`, AX/demand, no
reuse/rebundle and unchanged timeouts, driver and expectations. The original
failure remains a failure; this is not an until-green retry series or a
claimed flake fix. That follow-up completed successfully and is independently
reviewed below. No further device run was needed.

## iOS: identical-source follow-up independently reviewed

Run **39533271406** used a fresh arm64 Simulator app on iPhone 17 / iOS 26.4,
React 19.2.3 / RN 0.86.3. Its evidence confirms `diagnostic=false`,
`scenario=text-inheritance`, `axBackend=ax`, `canvasMode=demand`, no rebundled
JS commit, and the same source as Android. Archive metadata and `binaryRun`
belong to this follow-up itself, not the earlier run. Cold device discovery
took 40,842 ms and preparation completed in 46,444 ms; these are single setup
observations, not an improvement claim or a fix for the earlier timeout.

The independent reviewer recalculated **all 70 raw PNG/AX pairs**, including
measured point-to-3x-pixel coordinates, unique marker/Text nodes, bounds,
RGBA hashes, ink and stable within-case mount identities. Its regenerated
sequence agrees with **121 comparisons: 111 exact equalities and ten intended
ancestor changes, with 84 acknowledged actions**. Each retained state has one
capture, without discarding a failed capture in favour of a later one.

Static crops are 720 x 288 px. Runtime/opaque crops are 720 x 288 px at rest
or under local override, and 720 x 360 px after ancestor changes or override
removal. Equality is exact within iOS with no translation, resizing, blur or
tolerance; Android and iOS are not compared pixel-for-pixel with each other.
The same five fifth-panel states listed for Android were visually inspected
on iOS. The complete target, expected root/nested colors, ancestor changes,
local shielding and resumed inheritance are visible. All 70 images were
numerically reviewed, but only this five-image subset was individually viewed.

Downloaded bytes match their recorded source/run provenance:

- Simulator archive SHA256: `1010361e8d87bad0762f6db88a07bfbf105265ce7c4a5c2635410b6fcf6b627e`.
- `main.jsbundle`, read from that archive: `a3d92e241203a8f328a8496e969379192ed39d5cbd24ba9c62129e8224ce7bf9`.

## What this completes

Both platforms now have one independently reviewed fresh five-panel sample
at the fixed source: **140 PNG/AX pairs, 242 comparisons (222 equalities /
20 intended changes), 168 acknowledged actions** in total. The static path
and unchanged fallback agree with the retained same-OS rendering controls
through ancestor updates, label state, opaque memo/View propagation, local
override/removal and restoration. This completes #1146's bounded rendering
gate, including retention of the original failed setup; it is not a series
in which every attempt succeeded.

The next work is real typography/owner integration and measured update cost,
not adding another panel to this same fixture. That wider work and its
default-rollout gates are still governed by draft RFC 006. No ordinary
compiler or full/release selection is changed by this review.

## Reproduce and limits

From a trusted built checkout with the same v3 fixture manifest:

```sh
gh run download 39494512361 -R iray-tno/hozo -n hozo-native-showcase-android-text-evidence -D artifacts/text-static-review/android
gh run download 39494512361 -R iray-tno/hozo -n hozo-native-showcase-android-apk -D artifacts/text-static-review/apk
node examples/native-showcase/scripts/review-text-evidence.mjs --platform android --evidence artifacts/text-static-review/android --binary artifacts/text-static-review/apk --run 39494512361 --commit 9fd5e5bc4031ab69e563fd11652c316996e1c97c
gh run download 39533271406 -R iray-tno/hozo -n hozo-native-showcase-ios-evidence -D artifacts/text-static-review/ios
gh run download 39533271406 -R iray-tno/hozo -n hozo-native-showcase-ios-simulator-app -D artifacts/text-static-review/app
node examples/native-showcase/scripts/review-text-evidence.mjs --platform ios --evidence artifacts/text-static-review/ios --binary artifacts/text-static-review/app --run 39533271406 --commit 9fd5e5bc4031ab69e563fd11652c316996e1c97c
```

Artifacts have 30-day workflow retention, not permanent raw-evidence hosting.
The CLI regenerates the trusted checkout's manifest and fails on drift. It
does not execute downloaded app code. Raw failures and the setup log remain
on their original run instead of being hidden behind later success.

This does not establish cross-OS pixel equality, physical-device/Hermes
performance, AT behavior, every concurrent interleaving, full typography,
widget/transition/portal integration, all-property coverage or absence of
flakes. Ordinary compilation, full/release defaults and the runtime-only
control selection are unchanged. Broader owner integration and measured
rerender/performance review still precede default rollout and an accepted
ADR. RFC 006 remains Draft.
