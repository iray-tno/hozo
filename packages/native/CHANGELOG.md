# @hozo/native

## 0.4.0

### Minor Changes

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

## 0.3.0

## 0.2.0

- Introduce the optional Android New Architecture module and `moveAccessibilityFocus` / focus-outcome types.
- Observe the first accessibility-focus landing after an opener request and repeat the event at most once if it lands elsewhere. Do not use direct accessibility-focus actions behind TalkBack’s cursor.
- Applications explicitly inject the mover through `@hozo/behaviors/native` and rebuild for autolinking/codegen. iOS or an absent module retains the normal fallback. Tested on RN 0.87; not a universal Dialog-restoration guarantee.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.
