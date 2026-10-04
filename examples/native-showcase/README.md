# Native showcase

A dedicated Expo development app running **React Native Storybook**. It is
separate from `native-demo` (compiler/accessibility verification) and
`three-native-probe` (GPU measurements). No test controls or probe logging are
injected into the showcase.

## Run on a device

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

Manual checks on both platforms: select every story; toggle `disabled`; press
and reset the counter; type/save a name; open/close the keyboard; assemble and
disassemble the 3D scene; enable reduced motion; background/resume; switch away
from the GPU story. Verify labels with TalkBack/VoiceOver. A successful bundle
does not claim these checks have passed.

Reference: [React Native Storybook manual setup](https://storybookjs.github.io/react-native/docs/intro/getting-started/manual-setup/)
and [Metro configuration](https://storybookjs.github.io/react-native/docs/intro/configuration/metro-configuration/).
