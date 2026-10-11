# Owned media fixtures

## Audio

`hozo-audio.wav` is an original four-second mono 16-bit PCM WAV at 16 kHz.
Three quiet tones (440, 660, 880 Hz) start at 0.25, 1.25 and 2.25 seconds,
each lasting 0.4 seconds with gentle 10ms ramps. There is no speech or music;
the shared story describes the sequence. It is covered by the repository's
MIT license. It is never autoplayed by the story.

`node scripts/generate-audio-fixture.mjs` from `examples/showcase` reproduces
the checked-in bytes without a browser, microphone, network or external
codec tool. Tests verify those exact bytes and actual non-silent browser
samples; Native output is not claimed from an advancing clock or mock.

## Video

`hozo-video.mp4` is an original silent animation: a purple square travels across
a dark background for about four seconds. No speech, music, or other audio is
present. The adjacent showcase description supplies the visual alternative.
It is covered by the repository's MIT license.

Generated manually with `node scripts/generate-video-fixture.mjs` from
`examples/showcase`. The script needs Chrome with AVC MediaRecorder support.
Tests and demos use the checked-in file, never regenerate it or fetch a video
from the network. Recorded MP4 bytes/timing may vary when regenerated.

Chrome records one fragmented MP4 segment with an `mfra` index but no `sidx`.
Media3 1.9 (Expo Video 57's Android engine) ignores that `mfra`, marks the clip
unseekable and resets a paused seek to zero
([upstream report](https://github.com/androidx/media/issues/3088)). The generator
adds a `sidx` before the fragment and relocates the existing `mfra` offset, without
re-encoding any samples. `scripts/index-video-fixture.mjs` is deliberately limited
to this owned single-track, single-fragment recording; it is not a media converter
for application inputs. The regression test reconstructs the original 3420-byte
recording and verifies its original SHA-256, so changing the fixture to conceal
a playback failure cannot pass. The indexed fixture is 3464 bytes, SHA-256
`ec717bea2e39273270213654f7774a51aaed47b75b37ef843276f7d765322f58`.
