# @hozo/native

## 0.2.0

- Introduce the optional Android New Architecture module and `moveAccessibilityFocus` / focus-outcome types.
- Observe the first accessibility-focus landing after an opener request and repeat the event at most once if it lands elsewhere. Do not use direct accessibility-focus actions behind TalkBack’s cursor.
- Applications explicitly inject the mover through `@hozo/behaviors/native` and rebuild for autolinking/codegen. iOS or an absent module retains the normal fallback. Tested on RN 0.87; not a universal Dialog-restoration guarantee.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.
