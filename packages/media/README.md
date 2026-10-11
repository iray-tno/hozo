# @hozo/media

Video and audio playback outside the core facade: actual HTML media elements
on Web, independent `expo-video` / `expo-audio` engines on Native.

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

## Video contract

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

## Audio

```tsx
import { Audio, type AudioHandle } from '@hozo/media/audio'
import { useRef } from 'react'

function Sound({ src }: { src: string }) {
  const player = useRef<AudioHandle>(null)
  return <Audio ref={player} src={src} accessibilityLabel="Three rising tones"
    onError={error => console.warn(error.message)} />
}
```

Native Audio additionally needs Expo modules and `npx expo install expo-audio`
(SDK 57, 57.0.5). The `/audio` entry does not import `expo-video`; the root
Video entry does not import `expo-audio`. Web imports neither Native engine.
Both optional peers must be installed when their respective Native entry is
used; this is not a silent fallback. Adding the native module requires a new
app binary, not just a Metro reload.

`src` and `accessibilityLabel` are required, nonempty strings. URLs/URIs,
`autoPlay`, `loop`, `muted`, and the status/play/pause/end/error callbacks use
the same observed contract as Video. By default Audio includes shared Hozo
play/pause and backward/forward controls on **both** platforms. Native has no
HTML-audio-style control bar, so Audio does not substitute a browser-only UI.
No autoplay is enabled by default. `controls={false}` gives headless playback;
pass the handle ref and `onStatusChange` snapshot to `AudioControls` for a
separate or localized control group:

```tsx
import { Audio, AudioControls, type AudioHandle, type AudioStatus } from '@hozo/media/audio'
import { useRef, useState } from 'react'

function SoundWithControls({ src }: { src: string }) {
  const player = useRef<AudioHandle>(null)
  const [status, setStatus] = useState<AudioStatus | null>(null)
  return <>
    <Audio ref={player} src={src} accessibilityLabel="Three rising tones"
      controls={false} onStatusChange={setStatus} />
    <AudioControls player={player} status={status} seekStep={1}
      labels={{ play: 'Listen', pause: 'Pause' }} />
  </>
}
```

Audio's `seekTo(seconds)` returns a promise on both platforms because the
Native engine seeks asynchronously. Rejection is observable and handled by
the supplied controls. Replay waits for a rewind before requesting play;
late completion cannot restart a retired or disabled player. Acceptance is
not sample-exact positioning or proof that every source is seekable.
Unknown/live duration is null, not an invented zero. Source changes retire
listeners/resources; StrictMode effect replay creates a fresh committed
Native player. Merely rendering Audio does not allocate Native resources.

Audio never sets global audio mode, silent-switch behavior, background
playback or lock-screen policy and never requests recording permission.
Those decisions belong to the application/OS (see the
[SDK 57 Audio API](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)).
The playback-only Native showcase disables microphone/recording permissions
and background modes in its Expo config. Streams, recording, volume/rate,
session/interruptions, complete transcripts and other content alternatives remain
follow-ups. Authors still need appropriate alternatives for spoken content.

Real Chromium tests use an original checked-in PCM WAV and measure non-silent
samples from the actual audio element, keyboard play/pause, bounded seek,
end/replay/loop and source retirement. Mocked Expo event/lifetime tests and
Android/iOS Metro exports are separate evidence. They do **not** establish
Native audible output, interruption/silent-switch behavior, or screen-reader
operation. Both Storybooks include the same original three-tone demo; the
description supplies its non-speech alternative.

## Accessibility and evidence

### Shared controls

`VideoControls` is an optional companion to a `Video` with `controls={false}`:

```tsx
import { Video, VideoControls, type VideoHandle, type VideoStatus } from '@hozo/media'
import { useRef, useState } from 'react'

function ClipWithControls({ src }: { src: string }) {
  const player = useRef<VideoHandle>(null)
  const [status, setStatus] = useState<VideoStatus | null>(null)
  return <>
    <Video ref={player} src={src} accessibilityLabel="Product walkthrough"
      controls={false} onStatusChange={setStatus} />
    <VideoControls player={player} status={status} seekStep={10} />
  </>
}
```

Both platforms provide a named play/pause toggle, backward
and forward seek buttons, observed elapsed/duration text and error text.
Web uses real buttons (including Enter/Space); Native uses separately named
Pressables with supported button/disabled semantics, never a made-up playing
accessibility state. The toggle keeps its host/focus when its name changes.
The time text is not a live announcement on every playback tick.

The play label only becomes pause after an engine observation. Requests use
the current handle's clock, clamp seeks to a known duration and rewind an
ended source before replay. Unknown duration stays unknown; seek buttons
request a seek, not proof that the source/container supports one. A denied
request is visible, and a retired source's asynchronous failure cannot label
its replacement. Pass `disabled` when your player is unavailable/unmounted.

`seekStep` must be positive and finite (default 10 seconds).
`accessibilityLabel` names the control group (default "Video playback controls").
`labels` overrides `play`, `pause`, `backward`, `forward` and the
`position(currentTime, duration)` formatter for localization. Names must not
be empty. This first companion has no draggable slider, volume, caption selector or
fullscreen controls; standard engine controls remain an alternative.

A label and native controls do not establish media accessibility. Authors must
supply appropriate alternatives for content. External WebVTT tracks, embedded track selection,
audio description, poster, fullscreen/PiP
configuration and background playback are follow-ups in [#147](https://github.com/iray-tno/hozo/issues/147).
Do not use this first slice to claim complete caption or screen-reader conformance.

### Plain-text timed captions

`@hozo/media/captions` provides an engine-independent companion for either Video
or Audio. Place it beside/below the player and pass the **observed** status:

```tsx
import { MediaCaptions, type MediaCue } from '@hozo/media/captions'

const cues: readonly MediaCue[] = [
  { start: 0, end: 2, text: '[Door opens]' },
  { start: 2, end: 5, text: 'Welcome home.' },
]

// status comes from the player's onStatusChange, not a requested seek target.
<MediaCaptions src={src} status={status} cues={cues}
  enabled={captionsEnabled} accessibilityLabel="English captions" />
```

Cues are immutable plain-text arrays, ordered by `start` in seconds; replace
the array to change tracks/language. Intervals include start and exclude end.
Overlaps retain authored order, joined by newlines; gaps render nothing.
Times must be finite with `0 <= start < end`, and cue text/names must be nonempty.
Invalid requests throw instead of silently dropping text. Markup is literal
text, not HTML, JSX, or a WebVTT parser. Cue preparation snapshots/indexes once
per array; lookup skips future and wholly expired prefixes, although long
overlaps can still scan a prefix.

`src` identifies the media these cues describe. A null, loading, failed or
different-source status clears the text; `enabled={false}` hides it. Paused
and buffering playback retain captions at the last observed clock. Backward
seeks/replay use that clock without a forward-only cursor or synthetic timer.
Keep the correct cue list associated with each source; Hozo cannot verify
whether authored text describes the recording. Full transcripts/audio
descriptions remain author-supplied alternatives.

Web renders a named group with readable text; Native combines the name and
text in one accessible node. Neither sets a live region, which would speak
each cue over the soundtrack. This inline companion does not appear in OS
fullscreen/PiP, replace embedded subtitles, fetch external `.vtt` files, or
promise frame-exact synchronization (events are sampled by the engine). It
has no language selector; applications own selection and toggle controls.
It imports neither Expo engine. The `TimedCaptions` story demonstrates the
same cue list, toggle, seek and removal on both platforms. Real Chromium
playback, shared interval tests and mocked Native rendering verify distinct
layers, not TalkBack/VoiceOver or Native pixel certification.

`pnpm --filter @hozo/media test` checks common state rules, DOM/Expo adapter
events and Native component wiring. With Chrome it also decodes the checked-in
silent AVC fixture and exercises actual play/pause/seek/end/loop, bad-source
recovery, source switching and StrictMode cleanup. Chrome is required in CI;
without it a local playback test explicitly skips, not passes. Native mocks and
Metro exports **are not** iOS/Android decoder, pixel or assistive-technology
evidence. Both Storybooks share the same `VideoDemo` and local MP4. The separate
decoder probe passed the Android/iOS full-scenario gates in fresh-build
[run 38097310264](https://github.com/iray-tno/hozo/actions/runs/38097310264);
that emulator evidence does not validate this companion's screen-reader UI.
The additional `CustomControls` story demonstrates this companion
on both platforms. Chromium keyboard tests and mocked Native control wiring
are not TalkBack/VoiceOver certification of the new controls.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
