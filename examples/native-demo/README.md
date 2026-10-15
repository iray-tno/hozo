# Native Demo

End-to-end React Native demonstration app and acceptance suite for Hozo's Native lowering backend and Metro bundler integration (`@hozo/metro`).

## Overview

This demo verifies that:
1. Hozo compiles JSX and Tailwind classes across Metro's build pipeline without requiring React Native for Web (`react-native-web`).
2. Primitives (`View`, `Text`, `Pressable`, `Button`, `ScrollView`, `FlatList`, `Image`, `TextInput`) lower to Fabric primitives and `StyleSheet.create({...})`.
3. The generated candidate module (`node_modules/.hozo/candidates.native.js`) correctly resolves dynamic classes on device.
4. Production bundle sizes remain lean, with minimal runtime overhead compared to hand-written React Native styles.

## Development

Start the Metro development server:

```sh
pnpm --filter @hozo/example-native-demo start
```

Run automated bundle compilation tests:

```sh
pnpm --filter @hozo/example-native-demo test
```

## Production Bundle Measurement

To measure production Android bundle sizes and compare Hozo against an equivalent hand-written React Native baseline:

```sh
pnpm --filter @hozo/example-native-demo measure:production
```

This compiles minified non-development bundles and records raw and gzipped sizes to `dist/bundle-sizes.json`.

## Device Acceptance Criteria

### Android NDK preparation in CI

Before Gradle builds an APK, the Linux jobs run
`node scripts/prepare-android-ndk.mjs`. The version comes from
`android/build.gradle`; [SDK Manager](https://developer.android.com/tools/sdkmanager)
remains responsible for downloading and verifying the official archive.
Preparation also verifies the installed revision, executable tools and sysroot
rather than trusting exit zero alone.

Only the ZIP-reading failure observed in [#952](https://github.com/iray-tno/hozo/issues/952)
permits one additional acquisition, in a new temporary SDK and user-cache root.
License, permission, disk-space, timeout and other errors stop immediately.
Existing incomplete toolchains are not deleted or overwritten. Neither Gradle
nor device scenarios are retried by this helper.

Each job uploads `android-ndk-*` evidence: both attempt logs, outcomes, source SHA,
timestamps, disk space and bounded temporary/cache listings (including a small
hex prefix of surviving ZIP/temp files). SDK Manager may remove a failed download
itself; an HTTP status or response body is not inferred when unavailable. Failed
attempts remain recorded even when the second succeeds. Acquisition success is
not a claim that TalkBack or the app passed.

The separate `android-ndk` workflow installs into an empty SDK target and executes
its Clang. It cannot silently pass by reusing an NDK from the runner image.

For physical device and iOS/Android simulator validation (voiceover/talkback accessibility pass, hit-testing, and gesture verification), refer to [VALIDATION.md](./VALIDATION.md).
