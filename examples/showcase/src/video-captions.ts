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

export const japaneseSquareCues = parsePlainTextWebVTT(`WEBVTT

00:00.000 --> 00:02.000
[無音のアニメーション]
紫の四角が中央に向かって動きます。

00:02.000 --> 00:04.000
紫の四角が右に向かって動き続けます。
`)

export const squareCaptionOptions = [
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
] as const
