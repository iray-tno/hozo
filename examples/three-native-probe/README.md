# Three Native GPU probe

This private example measures candidate Native GPU hosts without adding them to `@hozo/three`.
The first fixture uses React Three Fiber's established Native entry over Expo GL. It records cold
renderer initialization, first frame, a real background/resume cycle, a 120-frame timing sample,
release APK size, and renderer teardown. The Android job retains the JSON report, logcat,
screenshot, and accessibility tree. The lifecycle report records whether Expo GL preserved or
replaced its context, measures active-to-frame recovery latency, and resets the 120-frame sample
so every reported frame was rendered after resuming. The retained `touch-attempts.txt` records
whether post-resume input was accepted immediately or needed a bounded retry.
It also drives an actual device tap through R3F raycasting, activates the public
`@hozo/three/r3f-native` action and destination controls, and proves that the action resolves the
same Three object while the destination reaches a Hozo navigation provider. TalkBack reads those
public controls as a button and link, reads the labelled and fallback modes, and leaves decorative
content silent. After the lifecycle sample, the probe also executes the same six version-pinned
real-scene fixtures as the browser GPU report. Both platforms must record GPU draw calls and public
semantic controls for every fixture; Android activates the first control in each scene, while iOS
records activation honestly as `not-run`.

The probe additionally renders the landing page's 56-part Kumimono scene from
`@hozo/example-three-kumimono`. Its procedural timber images use `DataTexture`,
so this fixture has no browser DOM or image-loader dependency. The same PBR
geometry, instanced roof tiles, lights, shadows, and assembly updater run on
both hosts. Collection requires two uploaded textures and measured assembly
rotation across rendered frames; the Android harness activates its public
pillar control. This is separate from the six version-pinned library corpus
fixtures and does not change portable coverage totals.

Each fixture switches to demand rendering after actual draw and animation evidence
has been collected, while still waiting for Android's real semantic activation.
Continuously drawing the heavy study can otherwise prevent UiAutomator from
obtaining an idle accessibility tree. The iOS completion wait has a separate
bounded 120-second budget for the full seven-fixture sequence and teardown;
ordinary lifecycle transitions retain their 30-second budget. Completion still
requires the persisted renderer-unmounted event and all collector assertions.

The product-viewer glTF uses R3F Native's `TextureLoader` to save its embedded PNG
to a local file, determine its decoded size, and upload it through Expo GL. Its
`AnimationMixer` advances from `useFrame`. The report requires host image decoding,
a GPU texture allocation, at least two animation updates, and a measured rotation
change; missing or non-finite animation evidence fails collection. This verifies
the small embedded PNG fixture, while external images, compressed textures, and
larger glTF assets need separate cases.

The Metro configuration also shares one CJS Three build between the application,
GLTFLoader, and R3F. Otherwise Metro's import/require conditions can bundle both
Three builds and leave ESM TextureLoader outside R3F Native's image-loader patch.
The source-workspace R3F singleton and this Three singleton serve different
purposes; both are needed by this probe.

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
| Expo prebuild, Android | Measured by CI | Release APK is generated, installed, touched through R3F raycasting, sampled, runs all six real-scene fixtures with native semantic activation, tears down, and is read by TalkBack. |
| Expo managed / Expo Go | Not yet claimed | The dependencies support Expo, but this repository has not run the fixture in Expo Go. |
| Bare React Native | Not yet claimed | Expo modules must first be installed and configured in the host app. |
| Expo prebuild, iOS Simulator | Measured by CI | Release app rendering, background/resume, resumed frame sampling, all six real-scene renders, and teardown are retained as artifacts. Pointer, semantic activation, and VoiceOver checks remain explicitly not run. |

Android Activity background/resume is measured. Forced driver- or OS-initiated context loss remains
unmeasured; a successful Activity resume must not be described as proof of arbitrary context-loss
recovery.
