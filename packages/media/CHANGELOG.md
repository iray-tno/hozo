# @hozo/media

## 0.4.0

## 0.3.0

### Minor Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `@hozo/media`, an opt-in package for Video and Audio. Web uses HTML media elements; Native uses independent `expo-video` and `expo-audio` engines. Media is not pulled into `@hozo/core` or screens that do not use it.
  
  The shared API includes named players, imperative playback handles, observed loading/error/buffering state, playback controls, source-bound seeking and seek sliders, posters, timed captions, caption language selection, volume, playback rate and pitch requests. The `/webvtt` entry parses the supported plain-text WebVTT subset; caption loading has an explicit retry instead of silently retrying failed requests.
  
  The `/source` companion resolves sources with cancellation and disposal tied to their lifetime. `/source/expo` is a separate optional adapter for Metro asset IDs. Native players still require their Expo engine; autoplay, seeking, gain and pitch requests are not promises that the browser or device accepted them. Headers, DRM, fullscreen/PiP parity and general streaming-engine configuration are outside this release's contract.

