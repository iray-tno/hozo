# Native text inheritance: production static selection

Tracking: [#1146](https://github.com/iray-tno/hozo/issues/1146).
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

## iOS: setup failure retained, comparison pending

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
cannot substitute for its missing iOS evidence.

One explicit iOS-only follow-up,
[39533271406](https://github.com/iray-tno/hozo/actions/runs/39533271406),
was started on a dedicated measurement ref at the **identical source**.
It uses a fresh app, diagnostics off, `text-inheritance`, AX/demand, no
reuse/rebundle and unchanged timeouts, driver and expectations. The original
failure remains a failure; this is not an until-green retry series or a
claimed flake fix. Its result and raw archive/PNG/AX review remain pending.

## Reproduce and limits

From a trusted built checkout with the same v3 fixture manifest:

```sh
gh run download 39494512361 -R iray-tno/hozo -n hozo-native-showcase-android-text-evidence -D artifacts/text-static-review/android
gh run download 39494512361 -R iray-tno/hozo -n hozo-native-showcase-android-apk -D artifacts/text-static-review/apk
node examples/native-showcase/scripts/review-text-evidence.mjs --platform android --evidence artifacts/text-static-review/android --binary artifacts/text-static-review/apk --run 39494512361 --commit 9fd5e5bc4031ab69e563fd11652c316996e1c97c
```

Artifacts have 30-day workflow retention, not permanent raw-evidence hosting.
The CLI regenerates the trusted checkout's manifest and fails on drift. It
does not execute downloaded app code. Raw failures and the setup log remain
on their original run instead of being hidden behind later success.

This does not establish cross-OS pixel equality, physical-device/Hermes
performance, AT behavior, every concurrent interleaving, full typography,
widget/transition/portal integration, all-property coverage or absence of
flakes. Ordinary compilation, full/release defaults and the runtime-only
control selection are unchanged. After this comparison is complete, broader
owner integration and measured rerender/performance review still precede
default rollout and an accepted ADR. RFC 006 remains Draft.
