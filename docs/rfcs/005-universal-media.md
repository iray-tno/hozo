# Universal media: a shared playback contract, platform-owned engines

Status: Video basic-playback slice, tracked by [#147](https://github.com/iray-tno/hozo/issues/147).

`@hozo/media` is an opt-in domain, not part of the core facade. Web uses the
actual HTML video element. Native's first engine is Expo SDK 57 `expo-video`;
adding another engine must preserve the shared observable contract, not expose
its different event vocabulary to applications. Expo's peer is optional for
Web consumers, required for consumers of the Native entry.

## First slice

URL/URI playback, play/pause/seek, loop/mute, loading/error/end observations,
standard platform controls, a shared name and small portable layout surface.
The package is a platform component, not a new Rust IR node. Compiler layout
can be supplied by surrounding Hozo primitives; media playback and lifetime
are runtime responsibilities. Author HTML video/audio lowering is not added.

Changing the source remounts its host. This costs one fresh player, but makes
the lifetime boundary explicit: no in-flight replacement can emit an old
decoder error against a new URI. Both hosts clean listeners before retiring
the source. Native creates an empty managed player and loads asynchronously;
the committed host releases it after removing listeners. No Native resource
is allocated in render, and effect replay creates a fresh player. Web stops both playback and resource loading and
restores the resource when React StrictMode replays effects.

Methods express requests. Events express observations. `play()` resolving is
not a claim that a frame was decoded; a seek target is not a guarantee of
frame-exact decoder positioning. Unknown/live duration stays null. Denied
autoplay is observable. Engine-generated callbacks identify their source.

## Boundaries and next slices

1. Audio and shared accessible custom playback controls. Native audio has no
   HTML-audio-equivalent visual control bar, so the UI needs explicit ownership.
2. Captions/subtitle contracts and accessible content alternatives. The original
   issue's assumption that an external Web `<track src="…vtt">` can simply be
   forwarded to every Native engine is **not established**. Expo's exposed
   subtitle selection targets tracks reported by its loaded source; assess
   external sidecar support and an overlay/other-engine option before promising
   that universal API. Do not silently discard a requested caption track.
3. Fullscreen/PiP, asset/header/stream formats, background/audio-session policy.
   Application/OS permission policy is not a silent library-global setting.

The original issue also sketches `accessibilityState={{ playing }}`; playing
is not a standard React Native accessibility-state field. Custom controls need
real accessible names, supported states/actions and value channels, rather
than inventing an ARIA/RN state. Standard engine controls alone are not a
screen-reader certification.

## Verification

Shared state and normalization tests; mocked Expo event/lifetime and actual
component wiring; real Chromium AVC playback with an owned local fixture;
Web Storybook a11y/reading-order checks and production Native Metro exports.
Treat these as separate layers. No codec support or native accessibility
claims follow from bundle success. Native decoding/pixels and TalkBack/
VoiceOver manipulation require their own device or emulator evidence.

The Native full-showcase drivers now request `Media/Video/PlaybackEvidence`,
using the same local MP4 and real media host. The ordinary platform-control
story is unchanged. The probe keeps standard controls off and supplies named
external controls, with a named image region around only the video viewport.
This is a measurement surface, not a certification of Expo's control-bar AX.
Both drivers require actual square pixels at the first frame and a paused 2s
seek, a changed horizontal centroid, an advancing observed playback clock,
pause, viewport removal, and a fresh paused-at-zero remount with first-frame
pixels. Three additional checks run within `full`; isolated SVG/GL/Canvas
scenarios are unchanged. Pixel polling is read-only, and a failed input is
never repeated. Captures, failed observations, phase, source hash and timings
are retained in `evidence.json`. No emulator success is claimed until these
gates pass on the actual CI app, with its binary/source provenance.

Sources: [Expo Video API](https://docs.expo.dev/versions/latest/sdk/video/),
[Expo Audio API](https://docs.expo.dev/versions/latest/sdk/audio/).
