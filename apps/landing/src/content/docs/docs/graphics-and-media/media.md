---
title: "Video & Audio (@hozo/media)"
description: "Universal Video and Audio playback, bundled asset resolution, accessible seek sliders, and WebVTT captions."
sidebar:
  order: 4
---

`@hozo/media` provides video and audio playback outside `@hozo/core`: real HTML `<video>` and `<audio>` elements on the Web, and `expo-video` / `expo-audio` engines on React Native.

```sh
pnpm add @hozo/media
# On React Native, install only the engine(s) you use:
npx expo install expo-video expo-audio expo-asset
```

The subpaths are strictly separated so Web bundles never import Expo or React Native, `@hozo/media` never imports `expo-audio`, and `@hozo/media/audio` never imports `expo-video`.

## `Video` and `Audio`

```tsx
import { Video, type VideoHandle } from '@hozo/media'
import { Audio, type AudioHandle } from '@hozo/media/audio'
import { useRef } from 'react'

export function Walkthrough({ videoUrl, audioUrl }: { videoUrl: string; audioUrl: string }) {
  const videoRef = useRef<VideoHandle>(null)
  const audioRef = useRef<AudioHandle>(null)

  return (
    <>
      <Video
        ref={videoRef}
        src={videoUrl}
        poster="/poster.png"
        accessibilityLabel="Product walkthrough"
        controls
        muted
        playbackRate={1}
        preservesPitch
        onError={(err) => console.warn(err.operation, err.message)}
      />
      <Audio
        ref={audioRef}
        src={audioUrl}
        accessibilityLabel="Three rising tones"
      />
    </>
  )
}
```

### Shared playback contract

- **Required accessible name:** `src` and `accessibilityLabel` are required non-empty strings.
- **Imperative handle (`ref`):** `play(): Promise<void>`, `pause()`, `seekTo(seconds)`, and `getStatus()`.
- **Observed status (`onStatusChange`):** reports `{ src, status: 'loading' | 'ready' | 'ended' | 'error', playing, buffering, currentTime, duration, seekability, error }`. Live streams report `duration: null`.
- **Speed and pitch:** `playbackRate` (`0.25` to `2`, default `1`) and `preservesPitch` (`true` by default). Out-of-range values throw before host allocation rather than clamping differently per OS.
- **Video poster lifecycle:** when `poster` is set, the cover stays visible until playback or an explicit `seekTo` produces an actual rendered frame (`requestVideoFrameCallback` on Web, `onFirstFrameRender` on Native), and both platforms render Hozo's shared controls below the viewport so the cover never hides OS buttons or drops focus on reveal.

## Preparing bundled assets (`@hozo/media/source`)

Bundlers represent media assets differently: Vite/Next return a URL string, whereas Metro `require('./clip.wav')` returns a numeric asset ID. `useMediaSource` unifies loading, error, and retry state across both:

```tsx
import { Audio } from '@hozo/media/audio'
import { resolveMediaURI, useMediaSource } from '@hozo/media/source'
// On Native with Metro numeric assets:
// import { resolveExpoMediaAsset } from '@hozo/media/source/expo'
import { Button, Text } from '@hozo/core'

export function BundledSound({ clip }: { clip: string }) {
  const asset = useMediaSource({ source: clip, resolveSource: resolveMediaURI })

  if (asset.error) {
    return (
      <>
        <Text>Audio asset error: {asset.error.message}</Text>
        <Button onPress={asset.reload}>Retry</Button>
      </>
    )
  }
  if (!asset.uri) return <Text>Loading audio…</Text>
  return <Audio src={asset.uri} accessibilityLabel="Notification chime" />
}
```

## Shared controls and accessible seeking (`@hozo/media/seek`)

Pass `controls={false}` to render headless media and pair it with `VideoControls`, `AudioControls`, or `useMediaSeek` + `@hozo/patterns`' `Slider`:

```tsx
import { type MediaSeekProps, useMediaSeek } from '@hozo/media/seek'
import { Slider, Text } from '@hozo/core'

export function MediaSeekBar(props: MediaSeekProps) {
  const seek = useMediaSeek(props)
  return (
    <>
      {seek.slider ? (
        <Slider key={seek.key} {...seek.slider} />
      ) : (
        <Text>{seek.position}</Text>
      )}
      {seek.error && <Text>{seek.error}</Text>}
    </>
  )
}
```

During a drag, `useMediaSeek` updates a local preview ("Seek to …") without flooding the media engine with seeks; releasing commits a single seek constrained to the engine's observed seekable ranges (`status.seekability`).

## Timed captions and WebVTT (`@hozo/media/captions`, `@hozo/media/webvtt`)

`@hozo/media/captions` provides engine-independent inline captions (`MediaCaptions`), a controlled radio-group language switcher (`MediaCaptionSelector`), and a hook (`useWebVTTCaptions`) backed by the pure `@hozo/media/webvtt` parser (`parsePlainTextWebVTT`):

```tsx
import {
  MediaCaptions,
  MediaCaptionSelector,
  useWebVTTCaptions,
  type VideoStatus,
} from '@hozo/media/captions'
import { useState } from 'react'

const languages = [
  { id: 'en', label: 'English', url: '/captions/en.vtt' },
  { id: 'ja', label: '日本語', url: '/captions/ja.vtt' },
]

export function CaptionedOutput({ src, status }: { src: string; status: VideoStatus | null }) {
  const [language, setLanguage] = useState<string | null>('en')
  const track = useWebVTTCaptions({
    mediaSrc: src,
    trackSrc: languages.find((option) => option.id === language)?.url ?? null,
  })

  return (
    <>
      <MediaCaptionSelector
        options={languages}
        value={language}
        onValueChange={setLanguage}
        accessibilityLabel="Caption language"
        offLabel="Captions off"
      />
      <MediaCaptions
        src={track.mediaSrc}
        status={status}
        cues={track.cues}
        enabled={language !== null}
        accessibilityLabel="Captions"
      />
    </>
  )
}
```

Neither Web nor Native marks `MediaCaptions` as a live region, which would speak every cue over the audio track itself. Instead, it renders a named readable group synchronized to the player's observed clock.
