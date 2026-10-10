# @hozo/media

Video playback outside the core facade: HTML `<video>` on Web, `expo-video` on Native.

```tsx
import { Video, type VideoHandle } from '@hozo/media'
import { useRef } from 'react'

function Clip({ src }: { src: string }) {
  const player = useRef<VideoHandle>(null)
  return <Video ref={player} src={src} accessibilityLabel="Product walkthrough"
    controls muted onError={error => console.warn(error.message)} />
}
```

Install `@hozo/media` for either platform. Native additionally needs Expo modules
and `npx expo install expo-video` (tested with Expo SDK 57's `expo-video` 57.0.5).
For an existing bare React Native app, install/configure Expo modules first.
The Web entry never imports Expo or React Native. The optional native peer
does not implement a fallback player: an app that uses Native Video must install
its engine. Neither `@hozo/core` nor a non-media screen gains this dependency.

## Shared contract

- `src`: nonempty URL or URI. For bundled files, Web can pass its bundler's URL;
  Native can pass `expo-asset`'s resolved `localUri`. A numeric Metro asset ID,
  request headers, DRM, and streams requiring special engine configuration are
  not part of this first API.
- `accessibilityLabel`: required, nonempty name. `testID` names the test target.
- `controls` and `playsInline` default to true. Controls are the browser/OS's
  own controls; appearance, keyboard and fullscreen behavior are platform-owned.
  `playsInline` requests inline playback in the browser. Native starts inline;
  its controls may enter fullscreen. This is not a fullscreen/PiP contract.
- `autoPlay`, `muted`, `loop`: false by default. Autoplay is attempted once per
  source when ready; browser policy can deny it. Denial is reported, not retried
  forever or treated as a successful start. Changing loop/mute does not reload.
- `fit`: contain (default), cover, fill. `style` is a deliberately shared subset
  (`width`, `height`, `borderRadius`, `backgroundColor`), defaulting to 100% × 180.
  Put the player inside a styled Hozo View for Tailwind layout; this first slice
  does not compile `Video` classes or replace author HTML video/audio tags.
- `ref`: `play(): Promise<void>`, `pause()`, `seekTo(seconds)`, `getStatus()`.
  Play resolving means the engine accepted the request, **not** a decoded frame
  or proof it was heard/seen. Observe `onPlay` and the status. Seeking requires
  a ready source, rejects negative/nonfinite times, and clamps known duration.

`onStatusChange` receives a snapshot with `src`, status (loading/ready/ended/error),
`playing`, `buffering`, `currentTime` in seconds, `duration` in seconds or null,
and `error`. `onPlay`/`onPause` observe playing-flag changes; a terminal end may
also cause a pause. `onEnded` observes a terminal end, not every loop. `onError`
includes src, operation (load/play/seek), and message. Load failure is terminal
for that source; command denial is not a decoder failure.

A changed src creates a fresh playback host, resets time/status, and retires old
listeners. Native loads asynchronously; the committed component host releases
its Expo player after retiring its session, including StrictMode effect replay. Web cleanup
pauses, removes the src and stops resource loading. Callback updates do not
replace the source; stale asynchronous failures cannot report as the new movie.

## Accessibility and evidence

A label and native controls do not establish media accessibility. Authors must
supply appropriate alternatives for content. External WebVTT tracks, captions,
audio description, poster, custom accessible controls, Audio, fullscreen/PiP
configuration and background playback are follow-ups in [#147](https://github.com/iray-tno/hozo/issues/147).
Do not use this first slice to claim caption or screen-reader conformance.

`pnpm --filter @hozo/media test` checks common state rules, DOM/Expo adapter
events and Native component wiring. With Chrome it also decodes the checked-in
silent AVC fixture and exercises actual play/pause/seek/end/loop, bad-source
recovery, source switching and StrictMode cleanup. Chrome is required in CI;
without it a local playback test explicitly skips, not passes. Native mocks and
Metro exports **are not** iOS/Android decoder, pixel or assistive-technology
evidence. Both Storybooks share the same `VideoDemo` and local MP4 for that next
device check.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
