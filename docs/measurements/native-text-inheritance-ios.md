# Native text inheritance: first iOS rendering comparison

Reviewed dedicated run: [39305398979](https://github.com/iray-tno/hozo/actions/runs/39305398979),
source `d8481a7020b1a6d0244e4169de4567d44fff5ba1` (#1105/#1106).
This is the opt-in text scenario, not the ordinary full-smoke job.

## Method and observed result

Fresh arm64 iPhone 17 Simulator, iOS 26.4, React 19.2.3 and RN 0.86.3,
AX/demand, diagnostics off, no reused build/rebundle. The downloaded archive
and its extracted `main.jsbundle` were independently hashed:

- Simulator archive: `59525432060b13c6ef158cb6cb18563741ed141dfcb74c2a84301c89bc5e15bc`.
- JS bundle: `1aafe8a9c78ba2448d18d388a47e53898b4b8b1522501d16f7b7d847d9385152`.

Both matched the saved evidence and archive/source/run metadata. All 24 saved
screenshots were independently re-cropped from their raw AX Text frames at
the observed 3x scale. Point/pixel bounds, RGBA hashes, root/nested/white ink
counts and independently sampled mode-marker colors matched the artifact.
There was one capture per state; no failed capture was discarded. Initial
and changed paragraphs were also visually inspected for visible full text.

All **40 comparisons** passed their intended assertion: 37 exact equalities
and three intended runtime changes. Ordinary RN Text, the shared Context
reference and proof-selected bindings had identical Text-region pixels and
absolute bounds for each corresponding state. No blur, tolerance, translation
or rescaling was used for equality. All 32 actions were acknowledged once;
React label-state tokens stayed stable within each case. These tokens are
not an instrumented count of Fabric host mounts or commits.

| Case | Initial | Ancestor changed | Label updated | Restored |
| --- | --- | --- | --- | --- |
| Complete static root + partial nested Text | 720 x 288 px | 720 x 288 px | 720 x 288 px | 720 x 288 px |
| Runtime root style + partial nested Text | 720 x 288 px | 720 x 360 px | 720 x 360 px | 720 x 288 px |

The static root shields the labels from ancestor changes. Runtime color,
case and layout visibly change and restore exact initial pixels. The label
update changes its accessible tick without changing pixels or state identity.
Layout callbacks remain diagnostic records with `verdict: not-assessed`,
not an independent rendering oracle.

## Earlier failure and limits

Run [39298177948](https://github.com/iray-tno/hozo/actions/runs/39298177948),
source `7f859c32`, failed **before native build or text comparison**. An export
unit test assumed its child installed a SIGTERM handler within 400ms, then
asserted exit status zero; it observed null instead. That run remains failed.
#1106 separated real timeout rejection from a READY-acknowledged SIGTERM
check, retaining deterministic status-zero/ETIMEDOUT rejection. The production
180s deadline and all pixel acceptance conditions were unchanged. This result
is from corrected source, not a retry that changes the earlier failure to pass.

At this source dispatch `native-showcase.yml` with `platform=ios`,
`ios-scenario=text-inheritance`, `ios-ax-backend=ax`, `ios-canvas-mode=demand`,
diagnostics off, empty reuse-build-run and rebundle-ios false. Artifacts are
`hozo-native-showcase-ios-evidence` (screenshots, AX, syslog and evidence) and
`hozo-native-showcase-ios-simulator-app` (archive/build metadata), with the
workflow's 30-day retention, not permanent raw-evidence storage.

This is one bounded same-device Simulator sample. Together with the separate
[Android sample](native-text-inheritance-android.md), it supports these two
fixtures on both renderers; it does not compare Android glyphs with iOS glyphs.
It is not full seven-property/paragraph-shaping conformance, opaque View/Button
inheritance, native span inspection, AT, physical-device performance or proof
of no flakes. In particular, the runtime label still receives `frame` directly;
this does not yet prove context-only propagation through an opaque View.
No production fallback or ADR acceptance follows; RFC 006 remains Draft.
