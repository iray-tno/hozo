# RNW-free production-build measurement: Bluesky social-app

This is a dependency-boundary measurement, not a claim that the application runs correctly after React Native Web is removed.

## Corpus and toolchain

| | |
|---|---|
| Repository | https://github.com/bluesky-social/social-app |
| Commit | `007c893de107c2ecbf2188d618196075f19c8f5a` |
| Node | `v24.19.0` |
| Package manager | `11.21.0` |
| Baseline mode | Expo Webpack production build |
| Hozo experiment | app-owned `.ts`/`.tsx` passes through the measurement loader (with Web lowering and `rnwFree: true`); `react-native` and `react-native-web` resolution then point to an absent module |

## Result

1. **The unmodified production graph builds:** 0 errors.
2. **The graph is not RNW-free:** the successful baseline contains 74 bundled React Native Web modules (430839 unminified module bytes reported by Webpack).
3. **Hozo lowering still leaves a real dependency boundary:** its successful production graph contains 73 RNW modules and makes 301 RN/RNW requests from 206 unique importing modules.
4. **Both app APIs and dependencies remain:** 64 app modules and 138 modules owned by 40 third-party packages make those requests.
5. **The block is effective:** repeating that build with RN/RNW unavailable produces 308 resolution diagnostics (305 errors and 3 warnings), and the failed graph contains 0 resolved React Native Web modules.

This confirms that today's `rnwFree` compiler option means “no direct React Native JSX remains.” It does not mean “the complete application dependency graph builds without React Native Web.” Keep the name for now, but do not make the broader release claim until these boundaries are closed.

## Blocked importers by owner

| Owner | Importing modules |
|---|---:|
| application | 64 |
| @sentry/react-native | 24 |
| @react-navigation/elements | 19 |
| react-native-keyboard-controller | 19 |
| react-native-reanimated | 9 |
| @react-navigation/bottom-tabs | 8 |
| expo-image | 5 |
| react-native-progress | 5 |
| @react-navigation/native | 4 |
| react-native-svg | 4 |
| toolchain-or-unknown | 4 |
| expo-linear-gradient | 3 |
| react-native-safe-area-context | 3 |
| @bsky.app/expo-scroll-edge-effect | 2 |
| expo-asset | 2 |
| expo-blur | 2 |
| expo-glass-effect | 2 |
| expo-modules-core | 2 |
| expo-web-browser | 2 |
| @bsky.app/alf | 1 |
| @bsky.app/peek-menu | 1 |
| @bsky.app/react-native-uitextview | 1 |
| @bsky.app/sift | 1 |
| @bsky.app/tapper | 1 |
| @react-navigation/native-stack | 1 |
| expo | 1 |
| expo-clipboard | 1 |
| expo-constants | 1 |
| expo-contacts | 1 |
| expo-file-system | 1 |
| expo-font | 1 |
| expo-linking | 1 |
| expo-media-library | 1 |
| expo-notifications | 1 |
| expo-privacy-sensitive | 1 |
| expo-sharing | 1 |
| expo-updates | 1 |
| react-native-device-attest | 1 |
| react-native-edge-to-edge | 1 |
| react-native-qrcode-styled | 1 |
| react-native-view-shot | 1 |
| react-native-web-webview | 1 |

## Remaining app-owned React Native boundaries

These counts are referenced identifiers remaining after Hozo lowering, restricted to modules that also reached the blocked production graph. Import declarations, type-only references, and JSX-only bindings removed by lowering are excluded.

The categories are ownership decisions, not claims that every counted use is live at runtime. The import audit excludes TypeScript positions as well as import declarations and JSX removed by lowering, aligning this production-build measurement with the false-positive correction in #378.

### Hozo core gaps

These are surfaces Hozo already claims to lower or bridge. Rows here are runtime component values rather than JSX tags—for example, components passed as defaults, factory inputs, or animation wrappers. Supporting those contracts requires value-level Web components, not another JSX rule.

| API | Modules | Priority | Ownership |
|---|---:|---|---|
| Pressable | 7 | P0 | Runtime component identity remains in component props and animation wrappers. |

### Hozo foundation candidates

These facts overlap with responsive styling, theme, or accessibility, but Hozo should adopt only the narrow capabilities it consumes rather than clone each complete React Native API.

| API | Modules | Priority | Ownership |
|---|---:|---|---|
| useWindowDimensions | 16 | P1 | Viewport foundation candidate, shared with responsive lowering. |
| Dimensions | 6 | P1 | Viewport foundation candidate, shared with responsive lowering. |
| AccessibilityInfo | 1 | P1 | Adopt only the accessibility facts Hozo consumes, not the full API. |
| useColorScheme | 1 | P1 | Theme foundation candidate; prefer one ambient color-scheme store. |

### Explicit compatibility boundaries

These are not commitments to reimplement the complete React Native subsystem. #388 hardens the narrow Animated.View adapter; its private-node risk matters, but the measured reach and explicit fallback keep it below core-gap work.

| API | Modules | Priority | Ownership |
|---|---:|---|---|
| LayoutAnimation | 14 | P2 | RNW is effectively a callback/no-op; low practical value. |
| Animated | 2 | P2 | Narrow compatibility boundary; full Animated is outside Hozo core. |

### Platform services

These belong in an optional platform/compatibility layer unless a smaller capability is already part of Hozo's UI, navigation, theme, or accessibility contract.

| API | Modules | Priority | Ownership |
|---|---:|---|---|
| AppState | 8 | P2 | Application lifecycle service, not UI lowering. |
| Linking | 6 | P2 | Platform/deep-link service; only navigation overlap belongs in Hozo core. |
| Alert | 2 | P2 | Platform service. |
| BackHandler | 1 | P2 | Platform service. |
| findNodeHandle | 1 | P2 | Imperative compatibility escape hatch. |
| InteractionManager | 1 | P2 | Scheduling service. |
| Share | 1 | P2 | Platform service. |

### Unclassified app APIs

| API | Reachable app modules |
|---|---:|
| None | 0 |

## Third-party packages in the blocked graph

Every row below is an external dependency boundary rather than a Hozo core gap. The measurement does not yet distinguish Web-dead code, configurable packages, adapter candidates, and unavoidable RNW dependencies; that requires package-by-package resolution experiments.

| Owner | Importing modules |
|---|---:|
| @sentry/react-native | 24 |
| @react-navigation/elements | 19 |
| react-native-keyboard-controller | 19 |
| react-native-reanimated | 9 |
| @react-navigation/bottom-tabs | 8 |
| expo-image | 5 |
| react-native-progress | 5 |
| @react-navigation/native | 4 |
| react-native-svg | 4 |
| expo-linear-gradient | 3 |
| react-native-safe-area-context | 3 |
| @bsky.app/expo-scroll-edge-effect | 2 |
| expo-asset | 2 |
| expo-blur | 2 |
| expo-glass-effect | 2 |
| expo-modules-core | 2 |
| expo-web-browser | 2 |
| @bsky.app/alf | 1 |
| @bsky.app/peek-menu | 1 |
| @bsky.app/react-native-uitextview | 1 |
| @bsky.app/sift | 1 |
| @bsky.app/tapper | 1 |
| @react-navigation/native-stack | 1 |
| expo | 1 |
| expo-clipboard | 1 |
| expo-constants | 1 |
| expo-contacts | 1 |
| expo-file-system | 1 |
| expo-font | 1 |
| expo-linking | 1 |
| expo-media-library | 1 |
| expo-notifications | 1 |
| expo-privacy-sensitive | 1 |
| expo-sharing | 1 |
| expo-updates | 1 |
| react-native-device-attest | 1 |
| react-native-edge-to-edge | 1 |
| react-native-qrcode-styled | 1 |
| react-native-view-shot | 1 |
| react-native-web-webview | 1 |

## Importer sample

- `@bsky.app/alf`: `node_modules/@bsky.app/alf/dist/utils/flatten/index.web.js`
- `@bsky.app/expo-scroll-edge-effect`: `node_modules/@bsky.app/expo-scroll-edge-effect/build/ScrollEdgeEffect.js`
- `@bsky.app/expo-scroll-edge-effect`: `node_modules/@bsky.app/expo-scroll-edge-effect/build/ScrollEdgeEffectProvider.js`
- `@bsky.app/peek-menu`: `node_modules/@bsky.app/peek-menu/build/ExpoContextMenuNativeView.web.js`
- `@bsky.app/react-native-uitextview`: `node_modules/@bsky.app/react-native-uitextview/lib/module/Text.web.js`
- `@bsky.app/sift`: `node_modules/@bsky.app/sift/build/Sift.js`
- `@bsky.app/tapper`: `node_modules/@bsky.app/tapper/build/index.js`
- `@react-navigation/bottom-tabs`: `node_modules/@react-navigation/bottom-tabs/lib/module/TransitionConfigs/TransitionSpecs.js`
- `@react-navigation/bottom-tabs`: `node_modules/@react-navigation/bottom-tabs/lib/module/utils/useAnimatedHashMap.js`
- `@react-navigation/bottom-tabs`: `node_modules/@react-navigation/bottom-tabs/lib/module/utils/useIsKeyboardShown.js`
- `@react-navigation/bottom-tabs`: `node_modules/@react-navigation/bottom-tabs/lib/module/views/BottomTabBar.js`
- `@react-navigation/bottom-tabs`: `node_modules/@react-navigation/bottom-tabs/lib/module/views/BottomTabItem.js`
- `@react-navigation/bottom-tabs`: `node_modules/@react-navigation/bottom-tabs/lib/module/views/BottomTabView.js`
- `@react-navigation/bottom-tabs`: `node_modules/@react-navigation/bottom-tabs/lib/module/views/ScreenFallback.js`
- `@react-navigation/bottom-tabs`: `node_modules/@react-navigation/bottom-tabs/lib/module/views/TabBarIcon.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Background.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Badge.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Button.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Header/getDefaultHeaderHeight.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Header/Header.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Header/HeaderBackButton.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Header/HeaderBackground.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Header/HeaderButton.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Header/HeaderIcon.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Header/HeaderSearchBar.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Header/HeaderTitle.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/Label/Label.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/MissingIcon.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/PlatformPressable.js`
- `@react-navigation/elements`: `node_modules/@react-navigation/elements/lib/module/ResourceSavingView.js`

## Interpretation and next work

- Audit the P0 residual primitive uses first; do not infer a JSX lowering failure from an imported value.
- Treat viewport, theme, and accessibility facts as focused foundation candidates rather than promising the complete React Native APIs.
- Keep application lifecycle, scheduling, sharing, and deep-link services outside core until an optional platform boundary is designed.
- Keep #388 as P2 hardening: make the existing Animated.View compatibility adapter explicit and diagnosable without expanding it into Animated reimplementation.
- Classify third-party packages as Web-dead/platform-gated, configurable, adapter candidates, or unavoidable RNW dependencies.
- Repeat the build after each adapter batch; source counts alone do not close this boundary.
- Inspect the successful final bundle for RNW modules before making a user-facing RNW-free claim.
- Runtime correctness, CSS fidelity, and browser interaction remain separate verification steps after the dependency graph builds.

## Reproduce

From a Hozo checkout with mise available:

`mise exec node@24.19.0 -- pnpm measure:bluesky:rnw-free`
