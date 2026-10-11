# Universal media: a shared playback contract, platform-owned engines

Status: Video/Audio playback and shared basic controls, tracked by [#147](https://github.com/iray-tno/hozo/issues/147).

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
Container seekability is also engine-owned: a loaded finite duration does not
prove that a source can seek. In particular, Expo SDK 57's Media3 1.9 engine
cannot seek our original Chrome fragmented MP4 with only an `mfra` index
([upstream](https://github.com/androidx/media/issues/3088)). The owned fixture
now includes a `sidx` index without changing its encoded samples or timing.
This fixes the measurement source, not arbitrary application containers;
explicit seekability/capability reporting remains follow-up work.

## Boundaries and next slices

`VideoControls` now supplies optional shared play/pause and stepped-seek UI.
Its command policy is shared; Web renders semantic buttons/group and Native
renders uncombined named Pressables. State follows observations, not requests;
fresh handle clocks drive seeks and retired request failures stay retired.
Labels/time formatting can be localized. The ordinary platform controls and
diagnostic playback probe are unchanged. Real browser keyboard and mocked
Native adapter tests do not certify assistive-technology operation. Slider,
volume and captions are not in this companion's first slice.

`Audio` and `AudioControls` use the independent `@hozo/media/audio` entry.
Web owns a real HTML audio element, reusing the video adapter's
HTMLMediaElement lifetime/event policy. Native owns one committed `expo-audio`
player per source. The original root Video entry does not import this engine,
and Audio does not import `expo-video`; their optional peers are independent.
Audio's `controls` default to the same Hozo-owned controls on both platforms,
not a browser bar with no Native equivalent. `controls={false}` is headless
playback; applications can attach `AudioControls` using the ref and observed
status. This first Audio slice is not HTML/RN migration lowering.

Audio's `seekTo` returns a promise on both platforms. Shared controls await an
asynchronous ended-source rewind before playing and catch seek denials;
unmounted, replaced or disabled players cannot be restarted by a late rewind.
Accepted seeks still do not prove sample-exact positioning. Handles keep their
identity across clock observations. Native end normalization accounts for
Android's `ended` state and iOS's ready-state/one-shot finish event, without
reporting a terminal end for loops. Live/unknown duration remains null.

No global audio mode, silent-switch policy, recording permission, lock-screen
controls or background behavior is configured by the component. Those are
application/OS decisions. The showcase's Expo config explicitly disables
recording permissions and background modes for this playback-only example.

1. Captions/subtitle contracts and accessible content alternatives. The original
   issue's assumption that an external Web `<track src="…vtt">` can simply be
   forwarded to every Native engine is **not established**. Expo's exposed
   subtitle selection targets tracks reported by its loaded source; assess
   external sidecar support and an overlay/other-engine option before promising
   that universal API. Do not silently discard a requested caption track.
2. Fullscreen/PiP, asset/header/stream formats, background/audio-session policy.
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

The fresh-build [run 38097310264](https://github.com/iray-tno/hozo/actions/runs/38097310264)
passed these gates on Android (13 full-scenario checks) and iOS (12), with
source and binary provenance retained in the artifacts. This is emulator
decoder/pixel evidence for the diagnostic probe, not a physical-device or
screen-reader validation of `VideoControls`, nor proof of zero flakiness.

During playback the diagnostic status label retains the first real decoder
time whose two-decimal display is above 0.25s, rather than repainting at every
tick: Android UIAutomator otherwise cannot obtain an idle AX tree. No time is
invented from a play request. The player callbacks and ordinary story are unchanged; paused time,
seek results, buffering, lifecycle and errors still update the label. Pixel
checks remain independent of this display. Unnamed iOS AX nodes are skipped,
not interpreted as status; a loading-only tree still times out.
The display and latch share one formatter, so a fractional tick such as
0.250001s cannot pin the readable status at 0.25s and conceal later advances.

Audio has an original checked-in four-second WAV (three quiet rising tones,
no speech/music) with a reproducibility check. Real Chromium playback checks
non-silent samples from the actual media element through an analyser, keyboard
play/pause, seek/end/replay/loop, error recovery and source retirement. Both
Storybooks use that same file and shared demo; Native tests exercise mocked
Expo ownership/events and production Metro exports. A successful mock, clock
or bundle is not evidence of Android/iOS audible output or assistive-technology
operation. Native Audio output/interruption/silent-switch verification remains
a follow-up, separate from the completed Video pixel probe.

Sources: [Expo Video API](https://docs.expo.dev/versions/latest/sdk/video/),
[Expo Audio API](https://docs.expo.dev/versions/latest/sdk/audio/).
