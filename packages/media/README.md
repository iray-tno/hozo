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
  own controls when no poster is supplied; appearance, keyboard and fullscreen behavior are platform-owned.
  `playsInline` requests inline playback in the browser. Native starts inline;
  its controls may enter fullscreen. This is not a fullscreen/PiP contract.
- `autoPlay`, `muted`, `loop`: false by default. Autoplay is attempted once per
  source when ready; browser policy can deny it. Denial is reported, not retried
  forever or treated as a successful start. Changing loop/mute does not reload.
- `volume`: player gain from 0 to 1 inclusive, default 1. Nonfinite/out-of-range
  values throw before creating a host; they are not clamped differently by each
  engine. Updating it does not reload, seek, play or pause. Mute is independent:
  changing volume while muted keeps playback silent, and unmuting uses the latest
  requested gain, including zero. Omitting it again resets the requested gain to 1.
  This is not system volume, perceived loudness, an audio-session policy or an
  observed volume field in `MediaStatus`. Browser/OS controls remain engine-owned.
  A browser that throws or observably ignores the gain reports `onError` with
  operation `volume`; that denial remains in status through readiness and
  suppresses autoplay until an accepted value is supplied. Manual playback is
  still an explicit caller request. No Web Audio graph or global session is
  silently installed to bypass the host. Accepted assignment alone does not
  establish effective output on every browser/device.
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
includes src, operation (load/play/seek/volume/rate), and message. Load failure is terminal
for that source; command denial is not a decoder failure.

A changed src creates a fresh playback host, resets time/status, and retires old
listeners. Native loads asynchronously; the committed component host releases
its Expo player after retiring its session, including StrictMode effect replay. Web cleanup
pauses, removes the src and stops resource loading. Callback updates do not
replace the source; stale asynchronous failures cannot report as the new movie.

## Shared playback speed

Audio and Video accept `playbackRate` (finite 0.25–2 inclusive, default 1) and
`preservesPitch` (boolean, default true). Invalid values throw before host
allocation, not platform-specific clamping. Zero is not pause; use `pause()`.
The common audible range deliberately excludes Expo Audio's larger/smaller
platform-specific limits and browser slow-motion rates that can mute sound.
Neither option reloads or seeks the source or changes its stable handle.
Removing either prop restores its default request. Native Audio uses Expo's
`setPlaybackRate(rate, 'high')` after setting pitch policy; newly loaded iOS
items receive that policy again; their queued loop copy is rebuilt after an
item/pitch-policy change so it cannot restore an old algorithm on the next lap.
There is no global audio-session change.

Changing speed never starts a paused player. Expo iOS Video's rate setter
itself assigns `AVPlayer.rate`, so Native Video retains a paused request until
`play()` or the platform's observed playback activation; an OS-control start
can briefly precede the requested speed. Live updates apply to the playing
engine. These props are requests, not additional observed fields in status.

Thrown rate/pitch commands and observable DOM/Native Video readback rejection
report source-bound `onError` with operation `rate`; the denial survives
readiness, does not become a decoder error, and prevents automatic play.
Native `play()` rejects if its rate command is rejected. An accepted update
clears the rate denial. Expo Audio Android queues its setter without an
acknowledgment; no immediate readback, optimistic status or success claim is
invented for that queued work. Asynchronous native failures cannot all be
detected through this SDK surface.

Pitch correction is an engine request, not sample-identical stretching or
verified audible pitch. Browser clock/wall-clock tests prove decoded speed
changes for both owned clips, not Native speed, audible pitch, interruption
or physical-device behavior. Native output/rate verification remains separate.
See [Expo Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/),
[Expo Video](https://docs.expo.dev/versions/v57.0.0/sdk/video/) and
[HTML media rates](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate).

## Video poster

```tsx
<Video src={movieUri} poster={coverUri} accessibilityLabel="Product walkthrough"
  onPosterError={error => console.warn(error.poster, error.message)} />
```

`poster` is an optional nonempty URL/URI; numeric Metro assets must first be
resolved by the application, like `src`. The cover is decorative, uses the
same viewport and `fit`, and never adds a second accessible name. Put any
meaningful information in the media's name, description or authored alternative.

The initial paused source retains its cover even after metadata and its first
frame arrive. Observed playback, or an accepted explicit `seekTo` (including
zero), begins viewing; the cover disappears only once a frame signal has also
arrived. A rejected play/seek does not reveal it. Pause, end, loop boundaries
and artwork changes do not cover an already viewed source again. A new `src`
or remount resets the policy. This is a shared contract, not the browser's own
`<video poster>` display flag, and a requested seek is not frame-exact positioning.

With a poster and `controls` enabled, **both hosts use Hozo's shared controls
below the viewport** throughout the source lifetime. The cover cannot hide OS
buttons and automatic reveal cannot discard the focused control. Without `poster`,
the original platform control bar is retained. `controls={false}` keeps author-owned controls;
use `VideoControls` separately for localized labels or a custom layout. Fullscreen/
PiP controls are not added by this slice. The portable width/height style describes
the viewport; shared controls occupy additional space below it. Explicitly
adding/removing `poster` changes the control mode; that author-driven UI change,
unlike automatic reveal, may replace its focused control.

Web prefers `requestVideoFrameCallback` (compositor submission). Older hosts
fall back to current decoded data (`readyState >= HAVE_CURRENT_DATA`), checked
at attachment and loadeddata/canplay/seeked; that fallback is **not** proof of
presentation. Native uses Expo's `onFirstFrameRender`, not `readyToPlay`. Frame
subscriptions and Native view/layout identities belong to their committed player,
so old events/effect replay cannot unlock a replacement source's cover.

Image failures are separately reported once as `{ src, poster, message }` through
`onPosterError`. They remove the broken image but neither set a decoder error nor
reload/pause the video. A new artwork URI creates a new image lifetime while the
cover is still eligible; render/clock updates do not retry. Changing/removing artwork
keeps the same media host/handle. There is no hidden playback, seek, timer or thumbnail
generation to make a first frame arrive.

Real Chromium tests compare **composed screenshots**, not video pixels hidden
behind an opaque image: the checked-in teal diamond changes to the actual purple
video square, and source replacement restores the diamond. Both Storybooks offer
`Media/Video/Poster`; Native full CI also adds a separate `PosterEvidence` round,
without weakening or warming up the original no-poster video gates. Mock/bundle
success is not Native cover-pixel, physical-device or screen-reader certification.

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
`autoPlay`, `loop`, `muted`, `volume`, and the status/play/pause/end/error callbacks use
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
and background modes in its Expo config. Streams, recording, playback rate,
session/interruptions, complete transcripts and other content alternatives remain
follow-ups. Authors still need appropriate alternatives for spoken content.

Real Chromium tests use an original checked-in PCM WAV and measure non-silent
samples from the actual audio element, keyboard play/pause, bounded seek,
end/replay/loop and source retirement. Mocked Expo event/lifetime tests and
Android/iOS Metro exports are separate evidence. They do **not** establish
Native audible output, interruption/silent-switch behavior, or screen-reader
operation. Both Storybooks include the same original three-tone demo; the
description supplies its non-speech alternative.

The Native showcase additionally has an isolated Android `audio-output`
diagnosis: QEMU records the virtual sound card, independent of the playback
clock or Expo sample callbacks. It checks the original tone frequencies/order,
nonempty silence while muted, restored output and resource removal/remount,
retaining WAV recordings and failed observations. Fresh-build
[run 38153397087](https://github.com/iray-tno/hozo/actions/runs/38153397087)
passed every phase: three-tone output, a nonempty silent muted recording,
unmute, removal and remount. Recording/fixture hashes and recomputed metrics
were verified separately. This establishes Android emulator virtual-output
behavior, not physical speakers, iOS capture or AT/session behavior. One run
does not establish zero flakiness. See the
[Native showcase instructions](../../examples/native-showcase/README.md).

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
the current handle's clock, constrain seeks to current engine ranges (or a
known duration when ranges are unknown), and rewind an ended source before
replay. Empty observed ranges disable seek/replay, not ready play or active
pause. Unknown duration stays unknown; seek buttons request a seek, not proof
that the source/container supports one. A denied
request is visible, and a retired source's asynchronous failure cannot label
its replacement. Pass `disabled` when your player is unavailable/unmounted.

`seekStep` must be positive and finite (default 10 seconds).
`accessibilityLabel` names the control group (default "Video playback controls").
`labels` overrides `play`, `pause`, `backward`, `forward` and the
`position(currentTime, duration)` formatter for localization. Names must not
be empty. This first companion has no draggable slider, volume or fullscreen
controls; caption selection is a separate `/captions` companion. Standard engine
controls remain an alternative.

### Direct seeking with a Slider

`@hozo/media/seek` exports `useMediaSeek` for either Audio or Video. This leaf
imports only React, not a widget, Native host or either playback engine. The
application supplies its slider and presentation; for example:

```tsx
import { type MediaSeekProps, useMediaSeek } from '@hozo/media/seek'
import { Slider } from '@hozo/patterns'
import { Text } from '@hozo/primitives'

function Seek(props: MediaSeekProps) {
  const seek = useMediaSeek(props)
  return <>
    {seek.slider
      ? <Slider key={seek.key} {...seek.slider}
          style={{ position: 'relative', height: 44, width: '100%', backgroundColor: '#e2e8f0' }}
          thumbStyle={{ position: 'absolute', top: 0, height: 44, width: 24, backgroundColor: '#4f46e5' }}
          fillStyle={{ position: 'absolute', top: 0, height: 44, backgroundColor: '#c7d2fe' }} />
      : <Text>{seek.position}</Text>}
    {seek.error && <Text>{seek.error}</Text>}
  </>
}
```

Pass the player's ref and **observed** `onStatusChange` snapshot. Use `seek.key`
as the Slider's React key: a new URI **or a replacement handle at the same URI**
retires the old gesture owner. Style the slider, including its focus appearance,
as appropriate for your application. This is an opt-in companion, not a change
to platform controls or the Audio/Video engine.

Drag changes only a local preview, identified by `previewing` and the default
"Seek to …" value text. `position` continues to describe the observed clock.
Release requests one seek; cancellation requests none. Keyboard and Native
increment/decrement actions commit one step. Accepted requests do not invent
an observed clock or change play/pause. Asynchronous Audio seeks disable this
slider until settlement; current denials are exposed, retired denials ignored.
Commit rechecks the handle/source, readiness, disabled state, duration and
current seekable ranges. A gap snaps to the nearest endpoint (ties earlier);
forward/backward buttons only move in their requested direction. Interactive
steps do not get trapped on a gap endpoint: if nearest-point projection
would leave the clock unchanged, use the next range in the requested direction.
This applies to Slider previews/commits, including keyboard/Native AX steps;
an imperative absolute `seekTo` keeps the nearest-point policy. Range reads
do not issue test seeks, mutate playback or manufacture clock observations.

Unknown/live durations, unready/invalid bounds or observed empty seekable
ranges return `slider: null` and a localized unavailable message, not a
fabricated maximum. Finite-duration sliders use the outer observed range
bounds and project previews/commits out of gaps. Live-window/DVR slider UI is
not part of this contract. A finite duration is **not** proof that a container
can seek: engine denials remain visible. `step` defaults
to one positive finite second; `accessibilityLabel` defaults to "Playback
position". `labels.unavailable`, `labels.position(seconds, duration)` and
`labels.preview(seconds, duration)` customize wording. No automatic live
announcement is attached to the advancing clock. Web keyboard and mocked
Native gesture/accessibility-action tests are not AT/device certification.

### Seek capability observations

Audio and Video expose `status.seekability` with the same contract, also
returned by `useMediaSeek` for application wording/policy:

- `available`, `origin: 'engine'`, `ranges: [{ start, end }]`: the engine
  currently exposes nonempty seekable timeline ranges in seconds.
- `unavailable`, `origin: 'engine'`, `reason: 'empty-ranges'`: no range is
  currently exposed. This can recover as loading progresses; it is not a
  permanent unsupported-format verdict.
- `unknown`, `reason: 'not-exposed' | 'not-observed'`: the adapter has no
  capability API or could not read it. Unknown does not mean unsupported.

Web reads `HTMLMediaElement.seekable`, never `buffered` or the duration as
proof. Media/progress events publish snapshots and command-time reads recheck
ranges without callbacks. Published range arrays are detached from engine
state. Expo SDK 57 Audio/Video do not expose seek capability/ranges: Native
therefore retains `unknown/not-exposed`, even after a successful command.
Best-effort Native buttons and finite-duration sliders remain available, with
the existing readiness, bounds and denial handling. Applications that require
confirmed capability can disable the companion when this status is unknown.

An available range is not a guarantee of exact seeking, decoder success or
pixel/audio output. No support is inferred from URI extensions or successful
property assignment. These are different amounts of host evidence under one
policy, not different meanings for the same request. See the
[HTML media seeking contract](https://html.spec.whatwg.org/multipage/media.html#dom-media-seekable).

A label and native controls do not establish media accessibility. Authors must
supply appropriate alternatives for content. Embedded track selection,
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
text, not HTML or JSX. Cue preparation snapshots/indexes once
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
fullscreen/PiP, replace embedded subtitles, fetch external `.vtt` files by itself, or
promise frame-exact synchronization (events are sampled by the engine). It
does not own language selection; applications pass the chosen cue list and can
use `MediaCaptionSelector` below. It imports neither Expo engine. The
`TimedCaptions` story demonstrates English/Japanese selection, Off, seek and
removal on both platforms. Real Chromium
playback, shared interval tests and mocked Native rendering verify distinct
layers, not TalkBack/VoiceOver or Native pixel certification.

### Choosing a caption language

`MediaCaptionSelector` from `/captions` is a controlled radio group on both
platforms. Pass labeled options with stable unique `id`s, a selected `value`,
and `onValueChange`. `null` explicitly selects Off. The selector sends requests;
the caller must update its value and choose the associated cues or track URL:

```tsx
import { MediaCaptionSelector, MediaCaptions, useWebVTTCaptions } from '@hozo/media/captions'
import { useState } from 'react'

const languages = [
  { id: 'en', label: 'English', url: '/captions/en.vtt' },
  { id: 'ja', label: '日本語', url: '/captions/ja.vtt' },
]

// Inside a component; src/status describe the current recording.
const [language, setLanguage] = useState<string | null>('en')
const track = useWebVTTCaptions({
  mediaSrc: src,
  trackSrc: languages.find(option => option.id === language)?.url ?? null,
})

return <>
  <MediaCaptionSelector options={languages} value={language} onValueChange={setLanguage}
    accessibilityLabel="Caption language" offLabel="Captions off" />
  <MediaCaptions src={track.mediaSrc} status={status} cues={track.cues}
    enabled={language !== null} accessibilityLabel="Captions" />
  {/* Display track.status/track.error and explicit retry separately, as below. */}
</>
```

Web uses actual labeled HTML radios in a named fieldset: browser-owned Tab,
Space and arrow navigation, unique radio names per selector, and no custom
keyboard emulation. Native keeps each named radio separately reachable with
supported checked/disabled states and a non-color selection indicator; it
does not combine all choices into one accessibility node. Controls have at
least 44px-high label/press targets. No live region announces playback ticks.

`accessibilityLabel` defaults to "Caption language" and `offLabel` to "Captions
off"; localize both and the option labels. Global `disabled` or an option's
`disabled` prevents requests without changing the selected value. Selecting
the current option does not deselect it. Empty names/ids/labels, duplicate ids
or a selected id outside the catalog are errors. When removing the selected
option, update the catalog and value together; there is no implicit fallback
to a different language. Reordering retains each radio's stable identity.

Selection never calls playback methods, fetches text or installs an engine
subtitle track. Pair it with immutable cues or `useWebVTTCaptions`; the latter
retires old cues during loading, Off and failure. This is inline caption UI,
not embedded-track discovery, browser/OS fullscreen or PiP. Real Chromium
keyboard tests, shared playback-story interaction and mocked Native semantics
cover separate layers, not TalkBack/VoiceOver certification.

### Converting plain-text WebVTT

The pure `@hozo/media/webvtt` entry exports `parsePlainTextWebVTT(text)` and
`WebVTTParseError`. It imports no React, Native host or playback engine and
returns the same `readonly MediaCue[]` for Web and Native. Load/decode text
using your application's file/network policy, then convert it once per track:

```tsx
import { parsePlainTextWebVTT, WebVTTParseError } from '@hozo/media/webvtt'

try {
  const cues = parsePlainTextWebVTT(decodedVttText)
  // Pass cues and their associated media src to MediaCaptions.
} catch (error) {
  if (error instanceof WebVTTParseError)
    console.warn(error.code, error.line, error.message)
  else throw error
}
```

This explicitly bounded subset accepts the `WEBVTT` signature (optional BOM
and signature comment), LF/CRLF/CR, cue identifiers, NOTE comments, ordered
overlapping cues, optional hour fields, three-digit milliseconds and multiline
plain text. Six semicolon-terminated references decode once: `&amp;`, `&lt;`,
`&gt;`, `&nbsp;`, `&lrm;`, `&rlm;`. Decoded angle brackets remain literal text.
Cue identifiers are validated but are not part of the rendered `MediaCue`.

Invalid syntax/intervals/order/duplicate identifiers/empty text raise
`code: 'invalid-webvtt'`; unimplemented constructs raise
`code: 'unsupported-webvtt'`. Both include a one-based line and message, and
never return a partially accepted track. STYLE/REGION, cue settings, markup
(including voice/ruby/language annotations), karaoke timestamps, other/numeric
references and stream timestamp maps are not supported. This is not the
browser's forgiving full WebVTT parser; do not strip these constructs to make
a file appear compatible. Convert errors into an application-visible failure.

No fetching, cache, UTF-8 byte decoder, source association or fullscreen track
installation is hidden inside conversion. The shared caption demo now converts
the same bundled original WebVTT text on both platforms, with unchanged output.
Chromium's actual hidden `<track>` parser independently verifies the accepted
fixture's timings and text; renderer tests consume its converted cues on both
platforms. See the [WebVTT specification](https://www.w3.org/TR/webvtt1/).

### Loading a caption track

`useWebVTTCaptions` from `/captions` loads and converts the same bounded
plain-text WebVTT subset on both platforms. Associate the track with the
recording it describes, and display its loading/error state separately from
playback. A failed caption track does not stop the video/audio:

```tsx
import { MediaCaptions, useWebVTTCaptions } from '@hozo/media/captions'
import { Button, Text } from '@hozo/primitives'

// Inside a component; status comes from Video/Audio's onStatusChange.
const track = useWebVTTCaptions({ mediaSrc: src, trackSrc: captionUrl })

return <>
  <MediaCaptions src={track.mediaSrc} status={status} cues={track.cues}
    accessibilityLabel="English captions" />
  {track.status === 'loading' && <Text>Loading captions</Text>}
  {track.error && <>
    <Text>Captions unavailable: {track.error.message}</Text>
    <Button onPress={track.reload}>Retry captions</Button>
  </>}
</>
```

The result includes `mediaSrc`, `trackSrc`, `status` (idle/loading/ready/error),
`cues`, `error` and `reload()`. Errors identify both sources and the load/parse
operation; parser errors retain `code` and one-based `line`. Failed or pending
requests return an empty cue array, never a partially parsed track or the last
successful language. `trackSrc: null` selects no track; `enabled: false` stops
loading and clears cues. Selecting, enabling, changing either source or the
loader, or explicitly reloading starts a fresh request. An ordinary render or
playback tick does not. There are no automatic retries or Hozo-owned caches.

Cleanup requests abortion, but correctness does not depend on the transport
honoring it: late success/failure cannot replace the current track, including
StrictMode replay and A → B → A source changes. Render immediately hides the
previous request's data; no request starts during server rendering. A loaded
track remains independent of the player's sampled clock and pause state.

The default loader uses platform `fetch`, checks HTTP success, then reads
`response.text()`. It is not a universal filesystem/asset decoder. Web CORS,
Native transport security, authentication/cookies, offline caching and timeouts
remain application/platform policy; the hook does not relax them. See
[React Native networking](https://reactnative.dev/docs/network) and
[Fetch behavior](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch).
For resolved local assets, headers, strict byte decoding or another network
client, supply a stable `loadText(trackSrc, signal): Promise<string>` function.
It must return decoded WebVTT, can honor the abort signal, and should throw
on acquisition failures. Define it outside render or memoize it to avoid a
request on every render. A numeric asset ID still needs an application adapter.

This hook installs no browser/OS subtitle track or fullscreen overlay. Track
names, language selection, error wording and retry UI belong to the application.
Tests exercise both host entries and real Chromium HTTP success, HTTP failure,
explicit retry and visible unsupported-format errors; mocked Native loading
does not establish native transport/file or screen-reader behavior.

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
