# @hozo/media

## 0.4.1

### Patch Changes

- [#1686](https://github.com/iray-tno/hozo/pull/1686) [`5c488f3`](https://github.com/iray-tno/hozo/commit/5c488f31bbf0d312222a8c290a9e379e674aa908) Thanks [@iray-tno](https://github.com/iray-tno)! - `Video` works on a page that is rendered to static markup and never hydrated ([#1674](https://github.com/iray-tno/hozo/issues/1674)). On Web, `autoPlay`, `muted`, `loop` and `poster` are now also the `<video>`'s own attributes. The poster overlay joins only once mounted. New props: `width` and `height` (intrinsic size: the box takes their aspect ratio instead of the fixed 180 height), `className` for the box, `preload`, and `nativeID`. Given a `className`, the Web box no longer applies its inline 100% × 180 default, so the classes size it. On Native the classes resolve at runtime on top of the default, which is why `@hozo/media` now depends on `@hozo/engine`.
- Updated dependencies [[`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b)]:
  - @hozo/engine@0.4.1

## 0.4.0

### Minor Changes

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

## 0.3.0

### Minor Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `@hozo/media`, an opt-in package for Video and Audio. Web uses HTML media elements; Native uses independent `expo-video` and `expo-audio` engines. Media is not pulled into `@hozo/core` or screens that do not use it.
  
  The shared API includes named players, imperative playback handles, observed loading/error/buffering state, playback controls, source-bound seeking and seek sliders, posters, timed captions, caption language selection, volume, playback rate and pitch requests. The `/webvtt` entry parses the supported plain-text WebVTT subset; caption loading has an explicit retry instead of silently retrying failed requests.
  
  The `/source` companion resolves sources with cancellation and disposal tied to their lifetime. `/source/expo` is a separate optional adapter for Metro asset IDs. Native players still require their Expo engine; autoplay, seeking, gain and pitch requests are not promises that the browser or device accepted them. Headers, DRM, fullscreen/PiP parity and general streaming-engine configuration are outside this release's contract.

