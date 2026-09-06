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

For physical device and iOS/Android simulator validation (voiceover/talkback accessibility pass, hit-testing, and gesture verification), refer to [VALIDATION.md](./VALIDATION.md).
