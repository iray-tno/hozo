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

[40275042608](https://github.com/iray-tno/hozo/actions/runs/40275042608)
completed **all 84 windows**, including all three rounds at 1000 lines. This
means capture completed, **not** that any frame-performance target passed.

- Collector: `21944438885250c876f854c845711d6b6ce5b0b7`.
- APK: `906f52821d01b72ffb8c3ccee7938d54e2f78fb6`, produced by run 40271810280;
  SHA256 `9420dc37419c33fea74812642a16cd2a817bb37f193dbe22b5d612a97773e1be`.
  The Git comparison found only documentation, collector and speech-expectation
  changes. No app, fixture, dependency or build-input difference was allowed.
- AOSP `default` API 36 x86_64 Pixel 6 emulator, SwiftShader, 1080x2400,
  observed refresh 60.000004Hz (**16.667ms** period), standalone Release/Hermes,
  React 19.2.3 / React Native 0.86.3. Host: Linux 7.0.0-1017-azure,
  four AMD EPYC 7763 logical CPUs. This is a shared CI/software-GPU environment.
- Completion needed at most three frame observations. Every pending dump is
  retained; final windows have zero pending/flagged rows and no recent-ring
  truncation. Screenshots show the named fixture and rendered tokenized lines.

The table uses three mount latencies and nine update latencies per line count;
each scrolling group combines twelve swipe windows. Latency endpoints are
different, as described above, and include work beyond JS execution alone.

| Lines / tokens | Mount median ms (range) | Update median ms (range) | Scroll frame p95 ms | Android janky / frames during scroll |
| --- | --- | --- | --- | --- |
| 10 / 80 | 32.594 (30.501–57.524) | 36.831 (32.572–61.952) | Not overflowing | Not measured |
| 100 / 800 | 101.488 (94.934–143.230) | 97.086 (91.391–136.571) | 119.226 | 314 / 392 |
| 300 / 2400 | 381.568 (341.593–410.885) | 316.015 (287.340–340.080) | 119.292 | 298 / 376 |
| 1000 / 8000 | 1189.840 (1142.302–1206.239) | 939.431 (898.686–1114.534) | 118.543 | 335 / 409 |

The ordinary mount-frame p95 values are 33.524 / 83.605 / 150.193 / 450.236ms;
update-frame p95 values are 33.586 / 53.930 / 116.847 / 384.693ms. Even the
10-line baseline misses one observed display period in this environment.
For 100 / 300 / 1000-line scrolling, 389/392, 376/376 and 407/409 ordinary
frames exceed that period. Those counts differ from Android's deadline-based
jank counts and must not be relabelled as exact dropped-display frames.
Scroll JS rAF p95 gaps are 54.234 / 49.535 / 52.320ms.

Full precision and sample counts are in [the derived JSON](code-block-android.json).
Recompute from the downloaded raw artifact with
`node examples/native-showcase/scripts/report-code-block-performance.mjs <artifact-directory>`;
the command writes `summary.json` and rejects an incomplete or missing matrix.
The earlier failed runs are not pooled into this result or compared as a
before/after speed claim: they ran in separate CI environments.

## Targets after #1289

The emulator's speed moves about 2x between CI runs (#1392), so an absolute
millisecond target would pass or fail with the host. The targets below are set
against a floor measured in the same run: the same 1000 lines as one plain
`Text` each, in the same scroller (#1398). Mounts are timed until the JS thread
has been quiet for 30 frames, which covers a windowed list's later batches.
Medians at 1000 lines, 8 tokens a line, line numbers on:

| Target | Whole block | Windowed block | Status |
| --- | --- | --- | --- |
| Scroll UI frame p95 within +10% of the plain list | 102.7 vs 103.7 ms | 88.0 vs 86.5 ms (+1.7%) | Met |
| One-line edit at most 100 ms | 86 ms | 84 ms | Met |
| Settled mount: a recorded ceiling, not yet reduced | 1176 vs 206 ms (5.7x, ceiling 6x) | 237 vs 20 ms (11.9x, ceiling 12x) | Recorded |

- Scroll and mount are from runs 40820765315 (whole) and 40820767773 (windowed).
- Edits are from runs 40816119756 and 40816122978. A line an edit leaves alone keeps its row (#1396).
- Scrolling frames are the same for the block and for plain text, so the 67–104 ms frames belong to SwiftShader, not to CodeBlock. The block's extra cost is on the JS thread: scroll rAF p95 is 46 against 19 ms whole, and 23 against 17 ms windowed.
- A mount ratio past its ceiling, measured in one run, is a regression. Lowering the ratios is [#1420](https://github.com/iray-tno/hozo/issues/1420).
- An update that replaces every line was not given a target. It still costs about 900 ms whole at 1000 lines.

## Measured limit and application guidance

**No tested long-block count establishes a 60Hz smooth-render/update/scroll
envelope on this emulator**; its software GPU misses one display period even
for plain text. Ten lines is a small functional fixture, not a performance
guarantee. Give a long Native block a `maxHeight`, so that it windows past 100
lines. Pass unchanged lines as the same objects, so that an edit redraws only
what changed. Avoid replacing every line at an animation or input frame rate.
These results do not establish a universal line cap for physical devices.

Performance improvement was tracked in
[#1289](https://github.com/iray-tno/hozo/issues/1289), and mount cost continues in
[#1420](https://github.com/iray-tno/hozo/issues/1420). This completes the bounded measurement requested by
[#1278](https://github.com/iray-tno/hozo/issues/1278), including the cases that
miss the budget. It does not complete performance optimization.

These emulator observations do not certify physical-device frame performance,
Native input, clipboard delivery or TalkBack/iOS VoiceOver. The maintainer
deferred physical-device validation on 2026-10-26 and retained that gap in
[known limitations](../../apps/landing/src/content/docs/docs/status.md).
Windowing came later (#1380, #1382); see the targets above.
