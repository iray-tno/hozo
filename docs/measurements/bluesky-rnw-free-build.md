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
3. **Hozo lowering still leaves a real dependency boundary:** its successful production graph contains 73 RNW modules and makes 341 RN/RNW requests from 241 unique importing modules.
4. **Both app APIs and dependencies remain:** 99 app modules and 138 modules owned by 40 third-party packages make those requests.
5. **The block is effective:** repeating that build with RN/RNW unavailable produces 348 resolution diagnostics (345 errors and 3 warnings), and the failed graph contains 0 resolved React Native Web modules.

This confirms that today's `rnwFree` compiler option means “no direct React Native JSX remains.” It does not mean “the complete application dependency graph builds without React Native Web.” Keep the name for now, but do not make the broader release claim until these boundaries are closed.

## Blocked importers by owner

| Owner | Importing modules |
|---|---:|
| application | 99 |
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

## Remaining app-owned React Native APIs

These counts are referenced identifiers remaining after Hozo lowering, restricted to modules that also reached the blocked production graph. Import declarations, type-only references, and JSX-only bindings removed by lowering are excluded.

| API | Reachable app modules |
|---|---:|
| Platform | 20 |
| Keyboard | 19 |
| useWindowDimensions | 16 |
| LayoutAnimation | 14 |
| AppState | 8 |
| View | 8 |
| Pressable | 7 |
| Dimensions | 6 |
| Linking | 6 |
| Alert | 2 |
| Animated | 2 |
| AccessibilityInfo | 1 |
| BackHandler | 1 |
| findNodeHandle | 1 |
| FlatList | 1 |
| InteractionManager | 1 |
| ScrollView | 1 |
| Share | 1 |
| TextInput | 1 |
| useColorScheme | 1 |

## Third-party packages in the blocked graph

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

- Prioritize the commonly reachable app-owned non-JSX APIs before compatibility aliases or adapters.
- Classify third-party packages as Web-dead/platform-gated, configurable, adapter candidates, or unavoidable RNW dependencies.
- Repeat the build after each adapter batch; source counts alone do not close this boundary.
- Inspect the successful final bundle for RNW modules before making a user-facing RNW-free claim.
- Runtime correctness, CSS fidelity, and browser interaction remain separate verification steps after the dependency graph builds.

## Reproduce

From a Hozo checkout with mise available:

`mise exec node@24.19.0 -- pnpm measure:bluesky:rnw-free`
