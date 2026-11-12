---
"@hozo/media": patch
---

`expo-video`'s peer range is now `>=58.0.13 <59`, matching `expo-audio` and `expo-asset`. It had stayed at `>=57.0.5 <58` when the other Expo peers moved to SDK 58, so a project on Expo SDK 58 got a peer warning for `expo-video`.
