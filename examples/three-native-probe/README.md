# Three Native GPU probe

This private example measures candidate Native GPU hosts without adding them to `@hozo/three`.
The first fixture uses React Three Fiber's established Native entry over Expo GL. It records cold
renderer initialization, first frame, a 120-frame timing sample, release APK size, and renderer
teardown. The Android job retains the JSON report, logcat, screenshot, and accessibility tree.
It also drives an actual device tap through R3F raycasting, then records TalkBack reading labelled
and fallback semantics while proving that decorative content stays silent.

Run `pnpm prebuild:android`, build the generated release app, start an emulator, and then run
`scripts/android-probe.sh`. Generated Android and iOS projects are intentionally ignored: the
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
| iOS | Not yet measured | This first spike deliberately proves one Android host before widening the matrix. |

Context loss and restoration are also still unmeasured. A clean renderer disposal is recorded, but
that is not evidence that a driver- or OS-initiated context loss restores correctly.
