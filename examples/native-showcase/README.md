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
The animated third-party sidebar omits its rows from idb's accessibility trees;
its iOS selector check uses Apple Vision to locate the visible Typography label
and taps the measured text bounds. OCR boxes are retained with the screenshot.
This verifies visible selection, not sidebar accessibility. Hozo control checks
still use accessibility labels and state.
Neither platform's checks claim
physical-device performance or TalkBack/VoiceOver coverage. iOS background/
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
`IOS_UDID` (alternatively `IOS_DEVICE`). It installs and restarts the showcase,
so use a dedicated simulator. Every subsequent action uses that exact UDID.

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
