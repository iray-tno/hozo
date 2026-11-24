# @hozo/media

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @hozo/engine@0.5.1

## 0.5.0

### Patch Changes

- [#1931](https://github.com/iray-tno/hozo/pull/1931) [`eebff26`](https://github.com/iray-tno/hozo/commit/eebff260a36ce11bc2e8258a028d8aad112c3642) Thanks [@iray-tno](https://github.com/iray-tno)! - `expo-video`'s peer range is now `>=58.0.13 <59`, matching `expo-audio` and `expo-asset`. It had stayed at `>=57.0.5 <58` when the other Expo peers moved to SDK 58, so a project on Expo SDK 58 got a peer warning for `expo-video`.

- [#1686](https://github.com/iray-tno/hozo/pull/1686) [`5c488f3`](https://github.com/iray-tno/hozo/commit/5c488f31bbf0d312222a8c290a9e379e674aa908) Thanks [@iray-tno](https://github.com/iray-tno)! - `Video` works on a page that is rendered to static markup and never hydrated ([#1674](https://github.com/iray-tno/hozo/issues/1674)). On Web, `autoPlay`, `muted`, `loop` and `poster` are now also the `<video>`'s own attributes. The poster overlay joins only once mounted. New props: `width` and `height` (intrinsic size: the box takes their aspect ratio instead of the fixed 180 height), `className` for the box, `preload`, and `nativeID`. Given a `className`, the Web box no longer applies its inline 100% × 180 default, so the classes size it. On Native the classes resolve at runtime on top of the default, which is why `@hozo/media` now depends on `@hozo/engine`.
- Updated dependencies [[`cb4b456`](https://github.com/iray-tno/hozo/commit/cb4b4564ddb95d7ecb6f729433bf5c956788b53e), [`ba5beaf`](https://github.com/iray-tno/hozo/commit/ba5beaf2fbaff50a5b6bb1595ee156cae9dd5a1c), [`0001fc4`](https://github.com/iray-tno/hozo/commit/0001fc442e38955770974fb5377002e4deb4b95f), [`ed04074`](https://github.com/iray-tno/hozo/commit/ed04074de82890b87590afb537a0bea99b2751a7), [`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b), [`052b447`](https://github.com/iray-tno/hozo/commit/052b447351a669a12c5b8ced61bef5d07dc8a604), [`43680e3`](https://github.com/iray-tno/hozo/commit/43680e3643ba9f3f6e01f5c7aa885feb8e5c7b04), [`35cc5c3`](https://github.com/iray-tno/hozo/commit/35cc5c31ce90497de9a6f345e884af2d20a6bc60), [`5c823ee`](https://github.com/iray-tno/hozo/commit/5c823ee87f1996f7011290af68702ef7f19e5388), [`70643e9`](https://github.com/iray-tno/hozo/commit/70643e959d229a75fcdbd1316f9a972efb4a2622), [`3a3a8d5`](https://github.com/iray-tno/hozo/commit/3a3a8d52d64d0d580d9afaa298977c5c33f295f2), [`45eda5b`](https://github.com/iray-tno/hozo/commit/45eda5b451bdf1449c7c16172c03b2a9e743aaa6), [`cca1211`](https://github.com/iray-tno/hozo/commit/cca1211b176ec411112275399fc582a92a50efbe), [`4f62450`](https://github.com/iray-tno/hozo/commit/4f624503a4fb9f4af6f699f7d2deb55b69a72c36), [`ddd7c73`](https://github.com/iray-tno/hozo/commit/ddd7c73d09768ad8fbcf55c40859729b7271ea1a), [`2d28017`](https://github.com/iray-tno/hozo/commit/2d2801735d14c61193610e74bc6178f15b79d07e), [`cabc969`](https://github.com/iray-tno/hozo/commit/cabc9695ae805afa2c690aebcad5657f76f95eac), [`3f1754a`](https://github.com/iray-tno/hozo/commit/3f1754a523e62dc44ccc3da7294e9510e5203302), [`b3cf38b`](https://github.com/iray-tno/hozo/commit/b3cf38b30f2fe748c4f73110d01de2566826355a)]:
  - @hozo/engine@0.5.0

## 0.4.0

### Minor Changes

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

## 0.3.0

### Minor Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `@hozo/media`, an opt-in package for Video and Audio. Web uses HTML media elements; Native uses independent `expo-video` and `expo-audio` engines. Media is not pulled into `@hozo/core` or screens that do not use it.
  
  The shared API includes named players, imperative playback handles, observed loading/error/buffering state, playback controls, source-bound seeking and seek sliders, posters, timed captions, caption language selection, volume, playback rate and pitch requests. The `/webvtt` entry parses the supported plain-text WebVTT subset; caption loading has an explicit retry instead of silently retrying failed requests.
  
  The `/source` companion resolves sources with cancellation and disposal tied to their lifetime. `/source/expo` is a separate optional adapter for Metro asset IDs. Native players still require their Expo engine; autoplay, seeking, gain and pitch requests are not promises that the browser or device accepted them. Headers, DRM, fullscreen/PiP parity and general streaming-engine configuration are outside this release's contract.

