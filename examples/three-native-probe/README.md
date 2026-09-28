# Three Native GPU probe

This private example measures candidate Native GPU hosts without adding them to `@hozo/three`.
The first fixture uses React Three Fiber's established Native entry over Expo GL. It records cold
renderer initialization, first frame, a real background/resume cycle, a 120-frame timing sample,
release APK size, and renderer teardown. The Android job retains the JSON report, logcat,
screenshot, and accessibility tree. The lifecycle report records whether Expo GL preserved or
replaced its context, measures active-to-frame recovery latency, and resets the 120-frame sample
so every reported frame was rendered after resuming. The retained `touch-attempts.txt` records
whether post-resume input was accepted immediately or needed a bounded retry.
It also drives an actual device tap through R3F raycasting, then records TalkBack reading labelled
and fallback semantics while proving that decorative content stays silent.

The iOS Simulator job measures the same Expo prebuild host through a Release app: initial GPU
rendering, a fresh 120-frame sample, and teardown. It also attempts a UIKit background/resume cycle
and measures the first resumed frame when the hosted simulator delivers it. Events are persisted to
the app's Documents directory because release-mode
JavaScript console output is not an iOS system-log contract. The simulator CLI cannot inject a
trusted canvas touch or traverse VoiceOver, so the iOS report records both as `not-run` instead of
borrowing Android's evidence. Some headless simulator images also acknowledge HOME and LOCK input
without backgrounding the React Native scene; that lifecycle check is recorded as `not-run` with
its reason while rendering and teardown remain measured.

Run `pnpm prebuild:android`, build the generated release app, start an emulator, and then run
`scripts/android-probe.sh`. The corresponding iOS route is `pnpm prebuild:ios`, a Release simulator
build, and `scripts/ios-probe.sh`. Generated Android and iOS projects are intentionally ignored: the
configuration in `app.json` is the source of truth, and CI proves prebuild rather than a checked-in
native project.

This is a measurement fixture, not a supported `@hozo/three` entry point. Expo GL and React Three
Fiber remain dependencies of this private example only.

## Current support evidence

| Environment | Status | Evidence |
| --- | --- | --- |
| Expo prebuild, Android | Measured by CI | Release APK is generated, installed, touched through R3F raycasting, sampled, torn down, and read by TalkBack. |
| Expo managed / Expo Go | Not yet claimed | The dependencies support Expo, but this repository has not run the fixture in Expo Go. |
| Bare React Native | Not yet claimed | Expo modules must first be installed and configured in the host app. |
| Expo prebuild, iOS Simulator | Measured by CI | Release app rendering, background/resume, resumed frame sampling, and teardown are retained as artifacts. Pointer and VoiceOver checks remain explicitly not run. |

Android Activity background/resume is measured. Forced driver- or OS-initiated context loss remains
unmeasured; a successful Activity resume must not be described as proof of arbitrary context-loss
recovery.
