import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Video, VideoControls } from '@hozo/media'
import { Audio, AudioControls } from '@hozo/media/audio'
import { MediaCaptionSelector, MediaCaptions, useWebVTTCaptions } from '@hozo/media/captions'
import { useMediaSeek } from '@hozo/media/seek'
import { resolveMediaURI, useMediaSource } from '@hozo/media/source'
import { parsePlainTextWebVTT } from '@hozo/media/webvtt'
import { WebView } from '@hozo/webview'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
for (const entry of [
  '@hozo/media',
  '@hozo/media/audio',
  '@hozo/media/captions',
  '@hozo/media/seek',
  '@hozo/media/source',
  '@hozo/media/source/expo',
  '@hozo/media/webvtt',
  '@hozo/webview',
]) {
  const resolved = realpathSync(fileURLToPath(import.meta.resolve(entry)))
  assert.ok(resolved.startsWith(`${process.cwd()}${path.sep}node_modules${path.sep}`), resolved)
}
for (const companion of [
  VideoControls,
  AudioControls,
  MediaCaptions,
  MediaCaptionSelector,
  useWebVTTCaptions,
  useMediaSeek,
  resolveMediaURI,
  useMediaSource,
  parsePlainTextWebVTT,
])
  assert.equal(typeof companion, 'function')

// SSR does not fetch these sources. This checks the Web exports and hooks,
// not playback, frame decoding, an embedded page or a Native media engine.
// /source/expo is only resolved above, not imported: explicitly opting into
// that adapter requires expo-asset, unlike every ordinary Web media entry.
const video = renderToStaticMarkup(
  createElement(Video, {
    src: 'https://example.invalid/video.mp4',
    accessibilityLabel: 'Product video',
  }),
)
assert.match(video, /<video\b/)
assert.match(video, /aria-label="Product video"/)
const audio = renderToStaticMarkup(
  createElement(Audio, {
    src: 'https://example.invalid/audio.wav',
    accessibilityLabel: 'Product audio',
  }),
)
assert.match(audio, /<audio\b/)
assert.match(audio, /aria-label="Product audio"/)
const frame = renderToStaticMarkup(
  createElement(WebView, {
    srcDoc: '<p>Embedded content</p>',
    title: 'Product details',
  }),
)
assert.match(frame, /<iframe\b/)
assert.match(frame, /title="Product details"/)

for (const peer of [
  'react-native',
  'react-native-web',
  'react-native-webview',
  'expo-video',
  'expo-audio',
  'expo-asset',
]) {
  assert.throws(() => require.resolve(peer), { code: 'MODULE_NOT_FOUND' })
}
console.log('packed media/WebView Web entries and named SSR hosts passed without Native/Expo peers')
