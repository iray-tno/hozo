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
It does not claim physical-device performance or TalkBack/VoiceOver coverage;
iOS still needs a native build and interaction check.

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
