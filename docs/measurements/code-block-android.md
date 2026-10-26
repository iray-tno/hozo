# CodeBlock: Android emulator frame observations

## Environment and reproduction

The fixed `Diagnostics/CodeBlock performance/Matrix` story measures wrapped,
copy-free `@hozo/patterns` CodeBlock with line numbers, eight precomputed tokens
per line and a fixed 20% insertion/deletion density. The increasing counts are
10, 100, 300 and 1000, with three rounds at each count. Each round mounts once,
updates all lines three times, then performs four alternating 800ms swipes in
the upper portion of overflowing content. The 10-line baseline fits the screen;
it has no scrolling-performance claim. This is not every scroll position,
token density, theme, styled wrapper or horizontal-scrolling configuration.

Dispatch `.github/workflows/native-showcase.yml` with `platform=android`,
`android-scenario=code-block-performance` and `android-target=default`.
Prefer a fresh build. A diagnostic reused APK must match its signing manifest,
producer run and SHA256, and the collector verifies unchanged application/build
inputs. The binary source and collector source are recorded separately.
The `hozo-native-showcase-android-code-block-evidence` artifact retains raw
per-window frame dumps, every pending observation, JS samples, source/APK
hashes, environment properties, screenshots and failures for 30 days.

Mount latency ends at the native layout callback. Updates end at React commit
plus two rAFs. JS rAF gaps measure responsiveness with observer overhead, not
JS execution self-time. UI/render duration is `FrameCompleted - IntendedVsync`
for ordinary completed `gfxinfo framestats` rows, compared with the observed
display period; Android's aggregate jank count is reported separately. This
is not an exact displayed-frame-drop count or separate main/RenderThread time.
Flagged/pending rows remain visible. The recent-frame ring is bounded, so its
coverage is compared with the all-window aggregate. See
[Android's dumpsys documentation](https://developer.android.com/tools/dumpsys#gfxinfo).

No operation is retried. Completion observations share the original 60s
operation window; no timeout, frame threshold or line count is raised to obtain
a successful run. Performance over budget remains a measured result.

## Earlier observations retained

- [40271810280](https://github.com/iray-tno/hozo/actions/runs/40271810280): the
  `google_apis` image never reported System UI ready within 90s. The app was
  not installed and no CodeBlock frame was measured. This is an environment
  failure, not a CodeBlock performance result.
- [40273502178](https://github.com/iray-tno/hozo/actions/runs/40273502178): the
  `default` image became ready in 7.881s, installed the same APK in 6.545s and
  reached the first 10-line mount. The collector rejected React Native's quoted
  console arguments. Its raw event/frame records are retained, with a regression
  test for that actual format; no application performance fix was made.
- [40274067689](https://github.com/iray-tno/hozo/actions/runs/40274067689): all
  three rounds through 300 lines produced observations. At the first 1000-line
  mount, JS reached its layout callback after 818.352ms, but the first fixed-delay
  frame dump still had `FrameCompleted < IntendedVsync`. The collector failed
  rather than treating that pending/stale timestamp as zero cost. Completion
  polling now retains every dump within the existing operation bound, with a
  test requiring both the pending and completed observations and the unchanged
  deadline.

## Completion record

The bounded completion run is tracked by
[#1278](https://github.com/iray-tno/hozo/issues/1278). A completed matrix and its
limits must be recorded here before claiming the measurement complete.

These emulator observations do not certify physical-device frame performance,
Native input, clipboard delivery or TalkBack/iOS VoiceOver. The maintainer
deferred physical-device validation on 2026-10-26 and retained that gap in
[known limitations](../../apps/landing/src/content/docs/docs/status.md).
Virtualization remains separate design work.
