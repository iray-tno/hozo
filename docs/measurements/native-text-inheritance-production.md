# Native text inheritance: production-owned helpers on Android and iOS

Reviewed dedicated run: [39365177992](https://github.com/iray-tno/hozo/actions/runs/39365177992),
source `83d96d9c32da00ba312eb16920e790ea58272728` (#1125).
This completes the bounded rendering review in [#1123](https://github.com/iray-tno/hozo/issues/1123)
and the context-only memo/View comparison in [#1112](https://github.com/iray-tno/hozo/issues/1112).
It does not enable a default fallback or accept RFC 006.

## What was compared

Fresh Android Emulator and iPhone 17 Simulator (iOS 26.4) builds ran the
isolated `text-inheritance` scenario with React 19.2.3 / RN 0.86.3. Diagnostics
were off, no binary was reused or rebundled, and iOS used AX/demand. Four
mounted panels occupied the same position in turn:

- Ordinary, explicitly styled React Native Text: the rendering control.
- The independent private Context reference.
- The private proof-selected implementation (plain RN Text for the complete
  static root; Context otherwise).
- The shipped engine/primitives ABI, selected by the real internal
  compiler/Metro route without replacing its Text imports. This production
  route still uses Context for every case, including the static case.

The three cases were a complete static root, a runtime-style root, and an
opaque cross-file memoized label containing a View. In the opaque case the
contextual labels receive no inherited frame/style prop; stable props and
ancestor changes must cross the memo bailout through Context. All cases
exercise ancestor changes, label state and restoration; opaque also applies
and removes a complete local override. The fixture combines size, weight,
line height, tracking, alignment, transform and color with nested blue text.
It is not an independent exhaustive test of each property.

## Independent raw review

The offline [reviewer](../../examples/native-showcase/scripts/review-text-evidence.mjs)
does not import the smoke driver's crop, AX or pixel helpers. It reads raw
PNG bytes and XML/JSON AX trees, independently finds unique Text/marker
nodes, maps iOS points to the observed 3x pixels, slices RGBA rows and
recomputes dimensions, hashes, ink counts and marker samples. It regenerates
the expected state/action/comparison sequence instead of accepting saved
`passed` flags. Its negative tests reject changed pixels, hashes, ink,
marker, bounds, missing/duplicate AX nodes and state identity.

Both platforms passed: **56 states, 56 PNG/AX pairs, 94 comparisons and 70
acknowledged actions each**. Every retained capture was checked; each state
had exactly one capture, with no discarded failed capture. Of the 94
comparisons, 86 require exact equality and eight require a visible ancestor
change. Corresponding panels have equal absolute Text bounds and identical
raw Text-region pixels on the same OS. Equality uses no translation,
resizing, blur or pixel tolerance. Ink and presented-marker checks are
separate nonblank/correct-panel gates, not relaxed pixel equality.

| State (all four panels agree) | Android crop | iOS crop |
| --- | --- | --- |
| Static, all phases | 630 x 252 px | 720 x 288 px |
| Runtime/opaque, initial and restored | 630 x 252 px | 720 x 288 px |
| Runtime/opaque, changed ancestor and label update | 630 x 315 px | 720 x 360 px |
| Opaque, local override applied | 630 x 252 px | 720 x 288 px |
| Opaque, local override removed | 630 x 315 px | 720 x 360 px |

Manual visual inspection covered these five production-panel images on each
OS: `static-initial`, `runtime-ancestor`, `opaque-override`,
`opaque-unoverride`, `opaque-restore` (the `-production-1.png` files).
They show complete wrapped text, the expected root/nested colors, visible
ancestor size/case changes, local shielding and resumed inheritance after
removal. This is a ten-image visual subset, not a claim that all 112 images
were individually viewed. All 112 were numerically reviewed as above.

Label mount tokens stay stable within each case, and label updates change
the accessible tick without changing glyph pixels. Tokens do not count
Fabric commits or native host mounts. Layout callback counts remain
`not-assessed`; they are not performance or rendering verdicts.

Actual downloaded binary bytes also match their evidence and source/run
metadata:

- APK SHA256: `f2b5df3413f037062f2430cfbb07b34f35c463d4b89b3fbb2f95e147a08dc072`.
- Simulator archive SHA256: `4821387694657b9486bc8949de94732b9aa102f1782474e58329cdf30964ac93`.
- `main.jsbundle` read from that archive: `4a9953f422fc64f1952bdc2bd330c1bb55af80c4b1daa0f6b444a0bbc329122f`.

The APK metadata records `debug-preview` signing, not release signing.
This review verifies its byte hash, not an independent certificate audit.
The fixture's v2 production source/forwarding and compiled-output hashes
also match local preparation on merged #1125. The later Media mock/cache
repair in that PR changed no measured Native input; its initial CI failure
remains visible in [39365139774](https://github.com/iray-tno/hozo/actions/runs/39365139774),
with corrected CI [39367623246](https://github.com/iray-tno/hozo/actions/runs/39367623246)
and full Native smoke [39367623242](https://github.com/iray-tno/hozo/actions/runs/39367623242)
successful. No new device run or retry was used for this review.

## Reproduce the review and its limits

From a built checkout with the same fixture manifest, download the four
artifacts, then run the offline review from the repository root:

```sh
gh run download 39365177992 -R iray-tno/hozo -n hozo-native-showcase-android-text-evidence -D artifacts/text-review/android
gh run download 39365177992 -R iray-tno/hozo -n hozo-native-showcase-ios-evidence -D artifacts/text-review/ios
gh run download 39365177992 -R iray-tno/hozo -n hozo-native-showcase-android-apk -D artifacts/text-review/apk
gh run download 39365177992 -R iray-tno/hozo -n hozo-native-showcase-ios-simulator-app -D artifacts/text-review/app
node examples/native-showcase/scripts/review-text-evidence.mjs --platform android --evidence artifacts/text-review/android --binary artifacts/text-review/apk --run 39365177992 --commit 83d96d9c32da00ba312eb16920e790ea58272728
node examples/native-showcase/scripts/review-text-evidence.mjs --platform ios --evidence artifacts/text-review/ios --binary artifacts/text-review/app --run 39365177992 --commit 83d96d9c32da00ba312eb16920e790ea58272728
```

The reviewer needs `tar` with ZIP support to read the archived bundle; it
does not execute archived code. The CLI prepares the trusted checkout's
compiler fixture and fails if its manifest has changed. It fails closed on
any retained capture that does not satisfy the final gates; it does not
silently select a later good capture. Artifacts have 30-day workflow
retention, not permanent raw-evidence hosting.

This is one bounded sample per virtual device, not cross-OS pixel equality,
physical-device/Hermes performance, AT, native span inspection, every
concurrent interleaving, typography/interaction/portal/animation integration,
all-property conformance or proof of no flakes. Ordinary compilation and
full/release defaults are unchanged. Production static erasure remains
unimplemented; private proof success does not certify it. Broader ownership
integration and performance review still precede default rollout and an
accepted ADR. RFC 006 stays Draft.
