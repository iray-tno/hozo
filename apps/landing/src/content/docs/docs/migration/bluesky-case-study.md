---
title: "Case study: Bluesky social-app"
description: "What happens when Hozo audits and compiles Bluesky's 1,660-file React Native application, and what remains when react-native-web is blocked."
sidebar:
  order: 2
---

To test Hozo against a real production React Native codebase rather than synthetic benchmarks, the repository pins a checkout of **Bluesky's [`bluesky-social/social-app`](https://github.com/bluesky-social/social-app)** (`007c893de107c2ecbf2188d618196075f19c8f5a`) and runs two reproducible measurements against it:

1. **`pnpm measure:bluesky`** — a read-only static compiler audit over all 1,660 authored JS/TS files using [`@hozo/migration-audit`](../migration-audit/).
2. **`pnpm measure:bluesky:rnw-free`** — a production Expo Webpack build experiment that compiles app-owned `.ts`/`.tsx` through Hozo and blocks `react-native` and `react-native-web` module resolution to map the exact dependency boundary.

Both reports are committed in [`docs/measurements/`](https://github.com/iray-tno/hozo/tree/main/docs/measurements) (`bluesky-social-app.md` and `bluesky-rnw-free-build.md`) so any change to compiler coverage or diagnostics shows up as a diff.

---

## Part 1: Static compiler audit (`pnpm measure:bluesky`)

### Corpus scope

| Metric | Value |
| --- | --- |
| Repository & commit | `bluesky-social/social-app` @ `007c893de107c2ecbf2188d618196075f19c8f5a` |
| Authored files | **1,660** (`1,049` `.tsx` + `611` `.ts`, **7,216,111 bytes**) |
| Platform split | `1,550` shared · `89` `.web` · `21` `.native` / `.ios` / `.android` |
| Styling surface | `651` files use `style`, `9` use `className`, `695` reference Bluesky's `atoms.*` |

### Headline results

1. **Zero parse or compile failures across all 1,660 files:** extension-aware syntax selection parses `.tsx` as TSX and `.ts` as TypeScript (so generic arrow functions such as `async <T>(...) =>` in `.ts` files parse cleanly without false TSX probe rejections).
2. **1,193 Web components and 1,149 Native components lowered across 573 files:** with **0** `UNLOWERED_REACT_NATIVE_JSX` errors and **0** DOM style-array invariant violations (`[styleA, styleB]` passed raw to a DOM element).
3. **The direct React Native JSX boundary on Web is closed:** Web lowering retains **0** JSX tag occurrences bound to `react-native` across all 1,639 Web-eligible files. Every `<View>`, `<Text>`, `<Pressable>`, `<ScrollView>`, `<FlatList>`, `<Image>`, `<TextInput>`, `<Modal>`, `<ActivityIndicator>`, and `<TouchableOpacity>` in application JSX is lowered to semantic DOM or Hozo's Web components.
4. **218 warnings, 0 errors:**
   - `135` `RN_COMPAT_NOT_INSTALLED` (files where the Web compiler rewrote `Platform`, `StyleSheet`, `Keyboard`, or `Dimensions` imports to `@hozo/rn-compat`, which the unmodified Bluesky checkout does not have installed).
   - `60` `MISSING_ACCESSIBILITY_LABEL` and `17` `PRESSABLE_NEEDS_ROLE` (interactive elements or inputs in Bluesky's source that have no accessible name or role).
   - `6` `UNSUPPORTED_CLASS_ON_NATIVE` (Web-specific class strings in the 9 files that use `className`).

### What happens to `react-native` imports and values on Web

The audit's binding-aware journals (`reactNativeImportDecisions`, `reactNativeReferenceDecisions`, and `reactNativeValueDecisions`) separate JSX tags from runtime value references:

- **Imports (`662` total `react-native` import specifiers in Web targets):**
  - `212` moved to `@hozo/rn-compat` (`StyleSheet`, `Platform`, `Keyboard`, `Dimensions`, `useWindowDimensions`, `AccessibilityInfo`, `PanResponder`)
  - `28` moved to `@hozo/core` (`Pressable`, `TextInput` used as runtime values)
  - `129` type-only specifiers (`StyleProp`, `ViewStyle`, `TextStyle`, `LayoutChangeEvent`, etc.)
  - `293` retained on `react-native` (either JSX-only bindings whose tag uses were already lowered and removed, or platform services such as `Linking`, `Share`, `AppState`, `InteractionManager`, and `LayoutAnimation`)
- **JSX tags (`4,132` opening/closing tag occurrences in Web targets):**
  - `4,117` lowered directly to HTML or Hozo Web runtime helpers
  - `15` preserved tag spellings whose import binding moved to `@hozo/core` or `@hozo/rn-compat`
  - **`0` retained on `react-native`**
- **Reviewed member contracts (`555` non-JSX runtime references in completed Web files):**
  - `358` covered by reviewed `@hozo/rn-compat` member contracts (`StyleSheet.create`, `StyleSheet.flatten`, `StyleSheet.hairlineWidth`, `StyleSheet.absoluteFill`, `Platform.OS`, `Platform.select`, `Keyboard.dismiss`, `Dimensions.get`)
  - `66` retained with explicit migration guidance (`Linking.openURL`, `Share.share`, `AppState.addEventListener`, `LayoutAnimation.configureNext`, `InteractionManager.runAfterInteractions`)
  - `131` unreviewed / whole-value references (such as passing `View` or `Animated` into third-party HOCs like `Animated.createAnimatedComponent`)

---

## Part 2: Production Webpack RNW-free build experiment (`pnpm measure:bluesky:rnw-free`)

Closing the direct JSX boundary in source files is necessary, but it is not the same as building a production Web bundle without `react-native-web`. To measure the full dependency graph honestly, `scripts/measure-rnw-free-build.mjs` runs Bluesky's production Expo Webpack build three ways:

1. **Unmodified baseline:** standard Expo Webpack production build.
2. **Hozo-lowered build:** app-owned `src/**/*.{ts,tsx}` runs through Hozo's Web lowerer (`unloweredReactNativeJsx: 'error'`) before Babel/Webpack.
3. **Hozo-lowered + RNW blocked:** the same Hozo-lowered build, but Webpack aliases `react-native` and `react-native-web` to an absent module so every remaining import request fails with an exact issuer trace.

### What the three builds showed

| Build | Webpack errors | Bundled `react-native-web` modules | What it proves |
| --- | --- | --- | --- |
| 1. Unmodified baseline | `0` | `74` modules (`430,839` unminified bytes) | The baseline app builds cleanly and ships ~431 KB of `react-native-web`. |
| 2. Hozo-lowered (`src/`) | `0` | `71` modules | Hozo's Web output compiles and bundles cleanly inside Bluesky's production Webpack pipeline. |
| 3. Hozo-lowered + RNW blocked | `274` errors (`270` requests from `177` modules) | `0` modules | Removing `react-native-web` entirely is blocked by **35 app modules** (non-JSX platform APIs) and **138 modules across 40 third-party packages**. |

### Why 35 app modules and 40 third-party packages still requested `react-native`

1. **Zero P0 Hozo core gaps in app code:** after Hozo lowering and moving `Pressable`, `TextInput`, `FlatList`, `ScrollView`, and `@hozo/rn-compat` APIs, the P0 core-gap table (`View`, `Pressable`, `FlatList`, `ScrollView`, `TextInput`) and P1 foundation table (`Dimensions`, `useWindowDimensions`, `useColorScheme`, `AccessibilityInfo`) in reachable app modules are **both 0**.
2. **The 35 app modules are platform services and imperative escape hatches:** `Linking`, `AppState`, `Share`, `InteractionManager`, `LayoutAnimation`, `Alert`, `BackHandler`, `findNodeHandle`, and `StatusBar`. These are non-UI OS services rather than view/style primitives.
3. **The 138 third-party modules come from 40 external React Native libraries:** led by `@sentry/react-native` (24 modules), `@react-navigation/elements` (19), `react-native-keyboard-controller` (19), `react-native-reanimated` (9), `@react-navigation/bottom-tabs` (8), `expo-image` (5), `react-native-progress` (5), `@react-navigation/native` (4), and `react-native-svg` (4). Because those `node_modules` packages are published targeting `react-native`, fully eliminating `react-native-web` from a bundle that keeps those libraries requires either Web-specific package entry points or bundler-level aliasing to `@hozo/rn-compat`.

## Reproducing both measurements locally

From a Hozo repository checkout:

```sh
# 1. Static migration audit (~10s warm; clones pinned social-app into temp/social-app on first run)
pnpm measure:bluesky

# 2. Production Webpack RNW-free boundary experiment (requires Node 24 for Bluesky's lockfile)
mise exec node@24.19.0 -- pnpm measure:bluesky:rnw-free
```
