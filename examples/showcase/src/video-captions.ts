import { parsePlainTextWebVTT } from '@hozo/media/webvtt'

// Bundled text keeps the two hosts' example independent of network/file-fetch
// policy. Applications can pass decoded text from their own loader instead.
export const squareWebVTT = `WEBVTT Moving square

NOTE Original captions for the owned silent animation.

first-position
00:00.000 --> 00:02.000
[Silent animation]
A purple square travels toward the center.

second-position
00:02.000 --> 00:04.000
The purple square continues toward the right.
`

export const squareCues = parsePlainTextWebVTT(squareWebVTT)
