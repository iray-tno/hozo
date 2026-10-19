# Native showcase

`Media/Video/Poster` shares the ordinary poster/custom-control demo with Web.
The full Android/iOS drivers additionally select `Media/Video/PosterEvidence`
after the original no-poster Video round. They require the owned teal cover
while ready/paused at zero, a real purple video frame after one explicit
seek-to-zero, actual viewport removal and a fresh remount showing the cover.
The cover cannot satisfy the video-pixel gate. `evidence.videoPoster` retains
both fixture hashes, all screenshots/failed observations, phase and wait times.
No input is repeated, no source is warmed up in the original round, and a mock
or successful export is not a claim of actual Native cover rendering.

A dedicated Expo development app running **React Native Storybook**. It is
separate from `native-demo` (compiler/accessibility verification) and
`three-native-probe` (GPU measurements). Verification stories are explicit;
no test controls or probe logging are injected into the ordinary demos.

**SVG / Shared filters / Filters** uses the same five filter scenes as Web
Storybook, with an on/off toggle. Metro resolves `react-native-svg` from this
host so workspace library peers do not select another version. The shared
[browser pixel checks](../showcase/README.md#svg-filters) are not evidence of
Android/iOS filter rendering. **SVG / Filter pixels** supplies five isolated
stories rendering that exact shared scene, initially unfiltered, without
scrolling or changing the filter graph. The Android driver captures off/on/off
inside a measured, non-flattened 96dp host and normalizes screenshot density.
The shared semantic checks require grayscale, blur outside the source, offset
red shadows with the blue source on top, and a screen-blended magenta source.
Native allows at most eight RGB levels of solid-colour deviation; it does not
claim exact Web/Native rasterizer parity or full filter-prop conformance.
The Android owner now converts SVG blur deviation to the density/viewBox-scaled
native kernel for both Gaussian blur and compact shadow. The original blur
position assertion is unchanged; the first failed run is retained, not counted
as a rendering pass or fixed by relaxing the pixel gate.

Android PR/weekly runs execute this isolated scenario **before** the unchanged
full interaction/Canvas scenario, with separate evidence. Dispatch with
`platform=android`, `android-scenario=svg-filters` to verify filters without
loading Kumimono. `hozo-native-showcase-android-svg-evidence` retains each
PNG/XML capture, logcat, source/binary provenance, per-effect measurements,
presentation waits and failures. Only image reads are polled; each toggle is
sent once, a failed case aborts, and changing labels cannot satisfy the gate.
The device checks must actually pass before claiming Native rendering.

iOS full runs verify the same five scenes after the ordinary interactions and
before Canvas, sharing the existing app launch and input connection. The original
nine full-scenario checks and Canvas deadlines are unchanged. Dispatch with
`platform=ios`, `ios-scenario=svg-filters` to verify only SVG without loading
Kumimono. `hozo-native-showcase-ios-svg-evidence` retains the PNG/AX JSON captures,
syslog, per-effect off/on/off measurements, point and Retina pixel bounds, source
SHA256, peer version, source/binary provenance and failures. Its success is separate
from full-scenario success, Canvas performance and screen-reader accessibility.
Both platforms use the same effect/restore gates, tolerances and 15s pixel budget;
only iOS screen-point-to-pixel conversion differs. A passed bundle or synthetic
Retina unit test is not simulator rendering evidence.

With the built APK and a dedicated connected device/emulator, reproduce only
this scenario using `HOZO_ANDROID_SCENARIO=svg-filters pnpm --filter
@hozo/example-native-showcase smoke:android` (PowerShell: set
`$env:HOZO_ANDROID_SCENARIO = 'svg-filters'` first).

On macOS, with the release Simulator app built as described below and the input
driver installed, use `HOZO_IOS_SCENARIO=svg-filters pnpm --filter
@hozo/example-native-showcase smoke:ios` for the isolated iOS measurement.

## Export-check evidence

`pnpm --filter @hozo/example-native-showcase test` runs the unit probes, then
fresh production Android/iOS Metro exports, serially. Each export retains its
original 180s deadline and two-worker limit. A timeout or signal fails even if
Expo handles SIGTERM by exiting zero; no retry is performed. Unique output
directories prevent an earlier bundle from hiding an incomplete export.

`artifacts/bundle-exports/{android,ios}.json` records the subprocess result,
elapsed time, failure phase, source SHA and metadata/bundle hashes. Success
requires all existing story-content and exact local media-asset assertions.
The narrowly triggered `native-export` workflow preserves these records and
the complete live log before main; the main integration report retains the
same JSON. This is bundle evidence, not device pixels or AT verification.

## Run on a device

**UI / Shared state checks** contains the ten styled shared screens documented
in [the shared showcase](../showcase/README.md#styled-ui-state-checks). Reload a
story to restore its deterministic initial state. These do not replace the
existing full smoke scenario or extend its evidence claims yet. In particular,
opening a story or exporting a Metro bundle is not visual verification of its
selected/expanded/disabled look. #898 still needs Android/iOS captures.

`metro.config.js` reads `src/index.css` for the UI theme, and trusts the canonical
`@hozo/core` authoring imports used inside styled wrappers as well as the
primitive, typography and pattern owners. `@hozo/ui` itself is not registered as
a primitive source: its styled wrappers must not lower into bare primitives.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @hozo/compiler build:native
pnpm exec turbo run build --filter=@hozo/example-native-showcase^...
pnpm --filter @hozo/example-native-showcase android
# macOS with Xcode:
pnpm --filter @hozo/example-native-showcase ios
```

The first run generates a local Android/iOS project and builds the development
client. Connect an Android device with USB debugging enabled, or select an
emulator. For an iPhone, configure signing in the generated Xcode project.
After installing the client, subsequent sessions only need:

```sh
pnpm --filter @hozo/example-native-showcase start
```

Use a **development build**, not Expo Go: Storybook's native dependencies are
pinned for this app, including safe-area-context 5.8.0, while Expo SDK 57's
bundled copy is 5.7.x. Metro export verifies bundling, not native linking or
device behavior.

## Release downloads

Version tags build and verify both platforms through the same `native-showcase`
workflow before npm or crates.io publication. A failure on either platform, missing
or mismatched evidence, or missing Android signing configuration blocks publication.
The manual release dry run exercises the same checks but uses a clearly labelled
debug-signed preview; it publishes neither packages nor a GitHub Release.

After both registries publish, GitHub Release receives:

- `hozo-showcase-vX.Y.Z-android.apk`: standalone arm64/x86_64 APK, signed with the
  fixed showcase key and tested after signing. Open it on an Android phone or run
  `adb install -r <file.apk>`. Allow installation from your browser/file manager
  when requested. No Metro server, Expo Go or Google Play account is required.
- `hozo-showcase-vX.Y.Z-ios-simulator.app.zip`: standalone Simulator app. Unzip it
  on a Mac, boot a compatible simulator, then run `xcrun simctl install booted
  HozoShowcase.app` and `xcrun simctl launch booted dev.hozo.showcase`. See the
  attached instructions for the actual binary architecture and minimum runtime.
- `INSTALL.md`, `SHA256SUMS` and `showcase-manifest.json`: installation instructions,
  hashes, Android certificate fingerprint, source/run and full/SVG check results.

The iOS download **does not run on an iPhone**. There is no signed IPA or TestFlight
integration yet. For personal iPhone testing, build the source using the local
instructions above, open the generated `ios/HozoShowcase.xcworkspace` on macOS, and
choose your own Personal Team under Signing & Capabilities. Set a unique bundle ID
if Xcode requires it, pair/select your device and enable Developer Mode. A free
Apple Account supports personal testing with provisioning that expires after seven
days; public distribution/TestFlight needs Apple Developer Program membership.
See [Apple's membership comparison](https://developer.apple.com/support/compare-memberships/)
and [Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).

Emulator functional checks are not physical-device, screen-reader or interactive
GPU performance certification. The known iOS heavy-scene latency remains separate.
For maintainers, fixed Android key setup and failure recovery are in
[release verification](../../docs/release-verification.md#showcase-signing-and-release-gate).

## Stories

- **Primitives / Shared showcase**: buttons (including disabled controls),
  typography and an editable form. Storybook Controls can change `disabled`.
- **Patterns / Shared showcase**: checkbox/switch preferences, controlled tabs
  with an unavailable section, and a confirmation dialog (closed/open states).
  These bodies are also in Web Storybook's shared showcase. Android smoke
  checks preference changes, disabled selection, tab content, dialog Back
  cancellation and confirmation. This is not a TalkBack focus-restoration
  claim; the known modal-window timing boundary remains separate (#484).
- **Three / Kumimono**: the same procedural scene used by the landing page,
  rendered with `@hozo/three/r3f-native` and Expo GL. Assembly/disassembly uses
  demand rendering, honors reduced motion and pauses in the background.
  Controls stay disabled while the initial renderer frame is loading.

`@hozo/example-showcase` contains platform-neutral story bodies; it deliberately
imports neither DOM APIs, React Native nor Storybook. Native story wrappers own
scrolling and keyboard behavior. Web Storybook also renders the same bodies
under **Showcase / Shared Web and Native**.

Add `src/**/*.stories.tsx` using `Meta` / `StoryObj` from
`@storybook/react-native`. Restart Metro to regenerate the ignored
`.rnstorybook/storybook.requires.ts`, or run `pnpm stories` in this directory.
Persisted selection is stored locally with AsyncStorage.

## Verify

The `native-showcase` GitHub Actions workflow builds a **standalone Android
APK** containing its JavaScript bundle (no Metro connection needed), installs
it on an API 36 emulator, and checks real Storybook selection, counter/reset,
disabled controls, keyboard/form input, Kumimono assembly/disassembly,
background/resume and switching away from the GPU story. It compares pixels
inside the accessible Canvas bounds, not changing labels outside the scene.

Download `hozo-native-showcase-android-apk` from a successful workflow run to
try it on an arm64 Android phone. This development showcase is debug-signed,
not a store release. `hozo-native-showcase-android-evidence` contains screenshots,
UI hierarchies, logs and `evidence.json`, including failures. Artifacts expire
after 30 days; rebuild via **Run workflow** when needed. The workflow runs
weekly on main, manually, and on PRs that change the showcase or its driver.
The same workflow builds an **offline iOS Simulator app**, installs it on an
iPhone 17 simulator, and exercises the selector, counter/reset, disabled
controls, keyboard/form, preferences, tabs, dialog cancellation/confirmation,
Kumimono assembly/disassembly and switching away from the GPU story. Its Canvas
pixel comparisons convert measured accessibility screen-point bounds to Retina
pixels; changing status labels cannot count as rendered animation. Both drivers
wait up to 15 seconds for presented Canvas pixels and reject a permanently blank
surface, including after animation. Only image reads are polled, not interactions.

`hozo-native-showcase-ios-simulator-app` contains the unsigned simulator `.app`
in a ZIP (for Apple Silicon macOS Simulator on the current runner, **not**
physical iPhones). CI builds only its host architecture rather than spending
time compiling the untested Intel slice; build locally below for another host.
`hozo-native-showcase-ios-evidence` contains screenshots, nested accessibility
trees, system logs and `evidence.json`, including failures. The iOS driver uses
[idb](https://fbidb.io/docs/idb/ui/) for real taps and keyboard input; it does not
inject test controls into the showcase.

The shared display-name field disables spelling/autocorrection: a person's
name should not be rewritten to an English dictionary suggestion. On iOS,
keyboard input sends each character once and observes every exact AX value
prefix (`H`, `Ho`, `Hoz`, `Hozo`) before sending the next character or saving.
`formInput` retains confirmed and pending prefixes on failure. A missing key
is never retyped, and both the field value and final `Saved: Hozo` must match.

The animated third-party sidebar omits its rows from idb's accessibility trees;
its iOS selector check uses Apple Vision to locate the visible Typography label
and taps the measured text bounds. OCR boxes are retained with the screenshot.
This verifies visible selection, not sidebar accessibility. Hozo control checks
still use accessibility labels and state.

Neither platform's checks claim physical-device performance or
TalkBack/VoiceOver coverage. iOS background/
resume and reduced motion remain manual checks; Android resume is automated.

With an Android SDK, connected emulator/device and Java 17, reproduce it locally
after the dependency builds above:

```sh
pnpm --filter @hozo/example-native-showcase prebuild:android
cd examples/native-showcase/android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
cd ../../..
pnpm --filter @hozo/example-native-showcase smoke:android
```

On Windows use `gradlew.bat`. Prebuild does not clean an existing generated
native project. The driver installs the showcase APK, resets its running
process and writes evidence; use a dedicated emulator rather than a device
where you need to preserve an active showcase session.

On macOS with Xcode, CocoaPods and `facebook/fb/idb` installed, reproduce the iOS
check after the dependency builds above:

```sh
pnpm --filter @hozo/example-native-showcase prebuild:ios
cd examples/native-showcase/ios
pod install
xcodebuild -workspace HozoShowcase.xcworkspace -scheme HozoShowcase \
  -configuration Release -sdk iphonesimulator -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO build
cd ../../..
pnpm --filter @hozo/example-native-showcase smoke:ios
```

The driver boots the available `iPhone 17`, or the simulator specified by
`IOS_UDID` (alternatively `IOS_DEVICE`). It installs and launches the showcase,
so use a dedicated simulator. Every subsequent action uses that exact UDID.

### Diagnose without rebuilding

Manually dispatch `native-showcase` with `reuse-build-run` set to a previous
repository run ID, `platform` set to `ios` or `android`, and `diagnostics` enabled.
This downloads that run's app artifact instead of rebuilding it. Results record
`binaryRun` separately from `driverCommit`: a reused binary is diagnostic evidence,
not proof that the current application source passed. Normal PR/weekly runs still
build the current source. The existing 30-day artifact retention applies.

iOS diagnostics first tap **General** in Apple's Settings app and check the
**About** row, then run the unchanged Hozo interaction assertions. Each idb call
records its duration and debug log. A UI command still running after 10 seconds is
sampled read-only in a separate process (companion, showcase and command process);
the existing 30-second input deadline and no-retry policy remain in place.
Companion logs are retained on both success and failure. Sampling can affect
timing, so use it to locate a stall, not to measure application performance.
Simulator discovery and the input companion connection happen before app
interactions; their cold framework initialization has separate bounded setup
budgets, with setup duration and the exact connected UDID recorded in evidence.
CI requests that exact simulator's boot before dependency/native compilation,
so cold OS preparation can progress during the build rather than starting only
after it. The later smoke driver still requires `bootstatus` within its existing
180-second readiness budget; no boot, input or assertion is retried. Early
preparation and full boot-progress stdout/stderr (including timeout output) are
retained separately from app launch and interaction results. This changes setup
scheduling, not the Canvas renderer, and does not prove universal simulator stability.
The cold app launch is one attempt with its existing two-minute setup budget;
it does not first terminate a nonexistent app session. `launches` records its
command, returned PID, duration and errors, separately from UI readiness.
After ten seconds, a still-blocked launch is sampled read-only (command,
showcase and SpringBoard) even in normal PR runs, so a pre-app stall has evidence.
Neither a launch timeout nor an input error is retried into a passing result.
AX/HID command deadlines and assertions are unchanged, with no input retry.
`ios-ax-backend` explicitly compares the guest (`axbridge`) and host
(`ax`, default) readers. The guest reader could not resolve even Settings on the
reference runner; the host reader reached the showcase controls. Inputs still
use HID in both cases; there is no automatic reader fallback or input retry.

`ios-scenario=canvas` isolates the unchanged Canvas pixel/animation and unmount
checks, so failures in an earlier keyboard/menu check cannot prevent collecting
renderer evidence. Results are labelled with their scenario; a Canvas-only pass
is not full showcase coverage. PR and scheduled runs still use `full`. Combine
it with `reuse-build-run` to inspect an already-built instrumented app.

`ios-canvas-mode=continuous` selects a separate continuous-frame story for an
explicit comparison with the default demand-driven story. Both use the same
scene, controls, completion states and pixel assertions. Continuous success does
not certify the canonical demand mode or establish a battery/performance-safe fix.

`ios-canvas-mode=instant` forces reduced motion in a separate story, keeping the
same two final scene states and pixel assertions but omitting intermediate
animation frames. `ios-scenario=gl-control` checks a direct Expo GL red-to-blue
clear without Three or R3F. That control uses a blocking GL error query, which
drains queued commands and affects timing; neither is canonical Canvas coverage.
`ios-canvas-mode=synchronized` keeps the animation and demand frame loop but
explicitly drains Expo's native command queue after each existing render via
`flushEXP`. This is a blocking diagnostic comparison, not a production fix,
presentation acknowledgement, or performance sample. Endpoint logs include the
renderer frame counter and command-flush time; screen pixels remain authoritative.
The unmodified demand story submitted 80 animation frames; after the old 15s
pixel deadline, read-only observation saw the correct disassembled endpoint
roughly 198s later (same 73.19% pixel change as the instant/synchronized controls).
This establishes delayed output on that hosted simulator, not a permanent freeze.

`ios-canvas-mode=paced` is a separate submission-count experiment. It keeps the
same simulation ticks, animation progress, geometry, materials, lights, shadows
and endpoint/pixel assertions, but coalesces intermediate render submissions to
at most 5Hz. The initial/final endpoints bypass that interval and are never
discarded. It wraps outside R3F's Native renderer/presentation function, so a
coalesced call submits neither drawing nor an empty `endFrameEXP` command. The
canonical story remains demand-driven without this gate. This fixed-rate
diagnostic is **not native backpressure**, a production quality setting or a
claim that five frames per second is acceptable interactive performance.

Endpoint logs now include JS-side render-call time and per-transition submitted
frames, peak/summed render-call time and main-pass draw counts. Three's normal
counter reset excludes shadow draws; CPU call duration may include existing
synchronous native waits. No extra GL queries, flushes or intermediate-frame logs
are added to the canonical path. `performance.json` extracts these measurements
and the separate screenshot wait times from the evidence, preserving failures
and source/binary/mode provenance. Neither source counts nor a screenshot wait
measures native queue depth, GPU time or exact presentation acknowledgement.
Evidence also records request-to-image end-to-end time and time to the AX
completion label. The old pixel wait begins only after that label, and therefore
omits cold renderer/shader startup and animation submission. For example, the
latest baseline's initial render call occupied about 43.5s before its 3.9s pixel
wait even began; that pixel wait was never total initial-load latency.

Compare fresh runs at the same source with `platform=ios`, `diagnostics=false`,
`ios-scenario=canvas`, and `ios-canvas-mode=demand` versus `paced`, retaining every
result. A reduction in delayed output with fewer submitted frames supports a
load/backlog explanation; it does not by itself distinguish command processing,
GPU/shadow cost or hosted-simulator overhead. Physical-iOS throughput and a
supported asynchronous completion signal remain separate investigation work.
The investigation and completion criteria are tracked in
[issue #716](https://github.com/iray-tno/hozo/issues/716).

`ios-canvas-mode=profile` requires `diagnostics=true` and selects a separate,
unpaced demand story. Before its first frame, it queries `RENDERER`, `VENDOR`,
`VERSION` and `SHADING_LANGUAGE_VERSION` once. Expo implements these as blocking
native calls: identity/query duration is kept in `performance.json.contextIdentity`,
not in the render-call timing. Missing or failed strings stay explicitly unknown;
a renderer name alone is not proof of hardware GPU use. No query is added to
canonical or paced stories, and there is no per-frame query or extra flush.

This mode also takes a three-second read-only native thread sample five seconds
after the cold-story request and each transition request, targeting only the
PID returned by that simulator's app launch. Samples, process CPU observations,
collector errors and host display metadata are retained in the evidence artifact.
Sampling can perturb execution, so this is a bottleneck/renderer diagnosis, not
an uninstrumented timing comparison or a physical-iPhone performance claim.
The unchanged pixel assertions and timeout still determine functional success;
sampling failure is recorded, not silently retried into diagnostic success.
`performance.json.renderProfiling` reads each collector's actual `sampling.json`
and records its result/error separately from the subprocess exit code. Its
`samplingComplete` is true only if all three observations succeed and each has a
nonempty native stack file. Functional success and GL identity do not imply that
thread sampling succeeded.

Only the heavy iOS scene's functional pixel budget is therefore five minutes;
it still returns as soon as pixels match and reports first-frame/disassembly/
reassembly wait times. Raw GL, Android and AX/HID deadlines are unchanged.
A functional pass is **not** interactive-performance or physical-iPhone evidence.
After a disassembly pixel timeout, diagnostic runs additionally observe the
unchanged screen read-only for up to five minutes, recording any late pixel
change separately. They still rethrow the original timeout and fail the job;
late output is not a passing check. No extra GL calls, invalidation or input are
introduced, so this can distinguish delayed queued output from a persistent freeze.

For JS-only iterations, `rebundle-ios=true` with `diagnostics=true` and a
`reuse-build-run` regenerates production Hermes bytecode and assets in the
restored simulator app. Native/dependency/configuration changes are rejected;
the base must be a manual native-showcase run whose source is unambiguous.
Evidence records the native build run and the new JS source commit separately.
This is not a substitute for the normal fresh-source build before merging.

Android diagnostics save boot logs, CPU/pressure, input-service state and system
ANR reports **before** starting the app, and again on failure. `android-target`
can select `google_apis` or `default` for a controlled system-image comparison.
The collectors can allow boot services extra settling time; diagnostic success
does not by itself establish that the normal cold-boot test is stable.

`android-canvas-rounds=5` adds four more mount/assemble/disassemble/unmount rounds
after the normal full sequence. Every mount requires the real completion state,
nonblank/changed Canvas pixels in both directions, and a working counter after
unmount. The total is bounded to 1-10, defaults to one, and is recorded in evidence.
Any failed round still aborts the run; these are additional samples, not retries.
Use `diagnostics=false` to avoid the extra boot-settling time of system collectors.

The Kumimono story reads Native AppState with `useSyncExternalStore`: a resume
between rendering and listener registration must not leave its frame loop on
`never`. Real React regression tests reproduce that schedule, including a failing
control using the former snapshot/passive-listener implementation. Foreground
still uses demand rendering; background pauses it without polling, remounts or GL
synchronization. Logs distinguish `frame-policy`, `renderer-created`, animation
completion and render submission. This repairs a proven lifecycle subscription
race, but does not alone establish the cause of the earlier isolated Android
startup failure or certify emulator/physical-device stability.

```sh
pnpm --filter @hozo/example-native-showcase typecheck
pnpm --filter @hozo/example-native-showcase bundle:android
pnpm --filter @hozo/example-native-showcase bundle:ios
pnpm --filter @hozo/example-native-showcase test
```

`test` checks Native lowering and resolver composition, then builds both
platform bundles and checks that all demo content is present. These exports
run in main's integration report; PRs run type checking and `test:unit`.

The Storybook Metro wrapper composes with `withHozo`; there is no separate
Native `@hozo/storybook` preset yet. This example demonstrates the complete
configuration without extending that Web-only package prematurely.

## Isolated Android audio output

Manual `native-showcase` dispatch with `platform=android`,
`android-scenario=audio-output`, `diagnostics=false`, and no `reuse-build-run`
builds a fresh app and selects `Media/Audio/OutputEvidence`. Normal full/SVG runs
still use `-noaudio`; this separate run deliberately enables QEMU's WAV sound
card (`QEMU_AUDIO_DRV=wav`, `QEMU_WAV_PATH`). It does not add microphone
permission, a native recording module or global audio-session policy to the app.
See the [emulator command-line reference](https://developer.android.com/studio/run/emulator-commandline)
and [QEMU WAV backend source](https://android.googlesource.com/platform/external/qemu/+/refs/heads/emu-master-dev/audio/wavaudio.c).

The story uses the ordinary Native Hozo Audio engine with the owned four-second
WAV looped. Named play/mute/remove/remount controls keep AX observation idle;
there is no ticking clock label and no app-generated output measurement.
After each command and observable state, a fixed one-second transition exclusion
is followed by one six-second output capture. The analyzer requires at least
five seconds of actual PCM, all three 440/660/880Hz notes with coherent tone
windows in cyclic rising order, and a nonempty digitally silent muted capture.
Unmute and remount must restore the tones; removal must stop sound, recording
zero new frames separately if the device goes idle. Actions/captures are never
repeated until they pass. A missing sink, short recording, noise, wrong notes,
wrong order or sound while muted fails rather than falling back to a clock test.

Tone detection is normalized by each window's RMS, not the source file's
amplitude: Android's OS/mixer can attenuate recognizable sound. A window must
still exceed sixteen 16-bit PCM quantization steps of RMS and 0.85 spectral
coherence; all three notes and their order are required. Mute and removal also
reject any recognizable fixture-tone window, even a sparse leak below the
whole-recording silence RMS/peak limits. The driver retains the requested
music volume index and Android's `--get` response instead of treating a volume
request as proof of the effective gain.

Fresh-build [run 38138743091](https://github.com/iray-tno/hozo/actions/runs/38138743091)
failed at the first playback assertion. Its retained 6.014-second recording
does contain the fixture (440, 660, 880, 440Hz; 6/3/3 coherent windows) at RMS
0.001016/peak 0.002838. The original 0.005 window-RMS prefilter discarded those
tones. Reanalysis identifies output, but does not turn that failed run into
a successful series: mute, unmute, removal and remount were never reached.
The revised gate requires a separate fresh-build run through every phase.

That separate fresh-build [run 38153397087](https://github.com/iray-tno/hozo/actions/runs/38153397087)
passed all three audio-output checks, with diagnostics off and source
`6c226b469cb4cb82a2da9599b25062105aca9d71`; its binary came from the same run.
Four verified 6.014s captures contain the fixture during play/unmute/remount
and digitally silent but nonempty PCM during mute. Removal produced zero new
frames. Downloaded recording/fixture hashes and recomputed metrics match the
evidence. This is one successful emulator virtual-output series, not physical
speakers, iOS audio, AT/session verification or proof of zero flakiness.

`hozo-native-showcase-android-audio-evidence` retains the raw `qemu-output.wav`,
listenable per-phase WAV slices and `evidence.json`: source/binary provenance,
fixture/recording hashes, frame ranges, sample rate/channels, timing, RMS/peak,
tone counts/order and the failed phase. QEMU finalizes its raw RIFF lengths on
shutdown; the live reader uses actual written bytes and snapshots valid headers.
No production player or decoder hook is changed for the analyzer.

This is an opt-in measurement, not yet an addition to full/weekly/release gates.
Unit tests validate its rejection behavior and orchestration with synthetic
recordings; they do not prove the emulator emitted sound. An actual successful
fresh-source run establishes virtual sound-card output only: physical Android
speakers, iOS output, audio-session interruptions and TalkBack/VoiceOver
operation remain separate checks. Do not describe these as measured until their
own evidence exists.

### Android gain/rate/pitch output diagnosis

Select `platform=android`, `android-scenario=audio-settings`, diagnostics off
and no reused build. `Media/Audio/SettingsOutputEvidence` keeps the ordinary
Hozo Audio player playing through seven fixed phases: baseline, gain 25%, gain
restored, .5x with pitch correction, 2x with correction, 2x without correction,
then gain/rate/pitch reset. Play is sent once; settings never seek, restart or
replace the player. The earlier `audio-output` mute/removal/remount series is
unchanged and remains independently selectable. Neither diagnostic changes
full/SVG, weekly or release gates.

Each phase excludes one second for queued transitions and captures twelve
seconds once from QEMU's sound-card sink. At least 11.5 seconds of PCM is
required. The analyzer searches an independent frequency catalog covering
original and half/double-shifted notes; requested labels/getters never feed
its measured pulse frequencies, onset timestamps or active-window RMS.
Complete pulses must include all three notes in cyclic source order and at
least two independent intervals. The source onset gaps are 1, 1, 2 seconds;
every resulting measured rate must lie within 20% of the requested rate.
Corrected output retains 440/660/880Hz; uncorrected 2x must emit 880/1320/1760Hz.

Gain compares median active-window RMS for each note against this run's
baseline, not whole-recording energy affected by partial silence/loop phases.
All three quarter-gain ratios must be 0.18–0.32, and restoration ratios 0.8–1.2.
The settings-specific 40ms spectral windows require four 16-bit RMS steps and
0.8 coherence so OS attenuation plus quarter gain does not erase tone identity.
The original diagnostic's 16-step/0.85 gates remain unchanged. Missing/short
output, wrong speed/pitch/order, noise, ignored settings or failed HID input
stop immediately, preserving the failed capture instead of retrying it.

`hozo-native-showcase-android-audio-settings-evidence` retains raw output,
seven valid per-phase WAV slices, source/binary provenance, fixture/capture
hashes, requested settings separately from observed metrics, pulse timelines,
interval rates, per-note gain ratios, actions, thresholds and any failed phase.
The analyzer/compiled-probe tests are not emulator evidence. Only an actual
successful run establishes virtual output; physical speakers, iOS output,
Video speed, exact DSP parity, AT and session/interruption behavior remain
separate checks. The harness setup itself establishes none of those results.

### Native text inheritance comparison (experimental)

Select `Diagnostics/Text inheritance/Comparison`
(`diagnostics-text-inheritance--comparison`). Three mounted panels share the real
compiled label body: ordinary RN Text, the private RFC 006 Context reference,
and a binding selected by the existing static proof. The static case can use
RN's built-in nested-Text inheritance; the runtime-style case must retain
the Context fallback. Production compilation and full/release scenarios do
not enable this experimental protocol.

Use `Show ordinary/reference/optimized` to reveal each panel at the same
position. Hidden panels remain mounted; an external mode-color marker lets
the screenshot driver verify actual presentation independently of AX.
Within a case, change the ancestor, update the label and restore; mount IDs
in accessible labels must stay stable. Switching cases intentionally starts
new labels. Actual `onTextLayout` callbacks log `[Hozo text layout]` records
with line metrics and versions, but always `verdict: not-assessed`. These are
not pixel, font-color/weight, AT or timing results. This change prepares the
screen; it does not claim it has been run on Android/iOS. The app's RN 0.86.3
also differs from the Node source probe's 0.87.1.

Regenerate/check its compiled source with
`node scripts/generate-text-inheritance.mjs [--check]` from this directory.
Details and remaining device evidence:
[Native text baseline guide](../../docs/native-text-inheritance-baseline.md#shared-reference-and-native-comparison-preparation).

Select `platform=android`, `android-scenario=text-inheritance`, diagnostics off,
with no reused build, for the opt-in screenshot driver (#1102). It measures
24 observations: static/runtime style, initial/ancestor-change/label-update/
restoration, ordinary/reference/optimized binding. AX provides actual Text
bounds and mount IDs. A screenshot must also show the current mode marker,
source-colored root/nested ink and white background. It then requires exact
same-device crop pixels and dimensions between bindings, static shielding,
runtime color/height change and restoration. No image translation, scaling,
blur or per-pixel tolerance hides a mismatch. Bounds compare the visible
Text region; they are not native line/span introspection or complete paragraph
shaping conformance. Callback logs remain diagnostic, not a pass oracle.

`hozo-native-showcase-android-text-evidence` retains evidence.json, every
screenshot/AX dump, raw callback logcat, APK hash, source commit and fixture
manifest. Failure stops immediately with partial observations retained;
inputs are never retried. Full/SVG/release scenarios are unchanged. The
analyzer's synthetic tests are not Android results; actual run evidence must
be inspected separately before claiming emulator rendering equivalence.
Physical devices, iOS, exact individual-property semantics, AT and performance
remain separate checks. No production default changes.

Manual checks on both platforms: select every story; toggle `disabled`; press
and reset the counter; type/save a name; open/close the keyboard; assemble and
disassemble the 3D scene; enable reduced motion; background/resume; switch away
from the GPU story. Verify labels with TalkBack/VoiceOver. A successful bundle
does not claim these checks have passed.

Reference: [React Native Storybook manual setup](https://storybookjs.github.io/react-native/docs/intro/getting-started/manual-setup/)
and [Metro configuration](https://storybookjs.github.io/react-native/docs/intro/configuration/metro-configuration/).
