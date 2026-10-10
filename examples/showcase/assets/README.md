# Video fixture

`hozo-video.mp4` is an original silent animation: a purple square travels across
a dark background for about four seconds. No speech, music, or other audio is
present. The adjacent showcase description supplies the visual alternative.
It is covered by the repository's MIT license.

Generated manually with `node scripts/generate-video-fixture.mjs` from
`examples/showcase`. The script needs Chrome with AVC MediaRecorder support.
Tests and demos use the checked-in file, never regenerate it or fetch a video
from the network. Recorded MP4 bytes/timing may vary when regenerated.
