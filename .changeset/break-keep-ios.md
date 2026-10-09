---
"@hozo/compiler": patch
---

On React Native, `break-keep` on a `Text` now sets `lineBreakStrategyIOS="hangul-word"`, so iOS keeps Korean words whole. It is still reported for what it does not cover: Chinese and Japanese, and Android. The Native line-breaking warning now also says that ordinary kinsoku is already the platform default, and points to `docs/upstream/react-native-line-break.md` for what waits on React Native.
