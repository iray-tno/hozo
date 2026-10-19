# Native text inheritance: first Android rendering comparison

Reviewed dedicated run: [39285182354](https://github.com/iray-tno/hozo/actions/runs/39285182354),
source `d245e0a75ec607c5ae0bf76770afb28c09fc3733` (#1103, #1102).
The separate ordinary full-smoke PR run does not establish these results.

## Method and observed result

Fresh Android 16/API 36 google_apis emulator, React 19.2.3 and RN 0.86.3,
diagnostics off, no reused build/rebundle. The APK SHA256 was independently
recomputed from the downloaded binary and matched evidence/signing metadata:
`cd2c53647f501531519ff438ddb7abcb77d929629a5b38ee9f8b2e6571fb9796`.

The artifact's `passed=true`, exact source/run/scenario and all **24 states**
were reviewed. Every screenshot was independently re-cropped using its saved
AX bounds. Crop hashes, source-colored ink and mode-marker measurements were
recomputed rather than trusting the saved pass flags. Mount IDs remained
stable within each case; all 32 actions were acknowledged once.
These are observable React label-state tokens, not an instrumented count of
Fabric host creation/destruction or native commits.

All **40 comparisons** passed their intended assertion: 37 equality checks
and three deliberately unequal runtime-change checks. Ordinary RN Text,
the shared Context reference and proof-selected bindings had exactly equal
Text-region pixels and absolute bounds at every corresponding state. No
pixel tolerance, translation, resampling or blur was used for equivalence.
The PNGs were also visually inspected: the full paragraph was visible in
the measured region, including the differently colored nested text.

| Case | Initial | Ancestor changed | Label updated | Restored |
| --- | --- | --- | --- | --- |
| Complete static root + partial nested Text | 630 x 252 px | 630 x 252 px | 630 x 252 px | 630 x 252 px |
| Runtime root style + partial nested Text | 630 x 252 px | 630 x 315 px | 630 x 315 px | 630 x 252 px |

The static case stayed unchanged after ancestor changes. The runtime case
visibly changed root color, case and glyph layout; restoration returned exact
initial pixels. The label-only update changed its accessible tick without
changing pixels or mount identity. Callback logs remain diagnostic records
with `verdict: not-assessed`; they did not provide the pass oracle.

## Reproduction and limits

At that source, dispatch `native-showcase.yml` with `platform=android`,
`android-scenario=text-inheritance`, diagnostics off and empty reuse-build-run.
Keep the full result, including a failure, rather than repeating until green.
Artifacts are `hozo-native-showcase-android-text-evidence` (screenshots, XML,
logcat, fixture manifest and evidence.json) and
`hozo-native-showcase-android-apk` (APK and signing metadata). They have the
workflow's 30-day retention, not permanent raw-evidence storage.

This is one bounded emulator sample of visible pixels and bounds. It is not
complete seven-property/paragraph-shaping conformance, native span inspection,
opaque View/Button inheritance coverage, iOS evidence, AT operation or a
physical-device/performance benchmark. It does not prove absence of flakes.
The prototype is not enabled in production and RFC 006 is still Draft.
