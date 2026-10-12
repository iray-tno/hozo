import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

test('published Audio and Video entries resolve independently; Web loads neither Expo engine', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  for (const engine of ['expo-video', 'expo-audio'])
    assert.equal(manifest.peerDependenciesMeta[engine].optional, true)
  for (const native of [false, true])
    for (const audio of [false, true]) {
      const result = await build({
        stdin: {
          contents: `export { ${audio ? 'Audio' : 'Video'} } from '@hozo/media${audio ? '/audio' : ''}'`,
          resolveDir: root,
        },
        bundle: true,
        write: false,
        format: 'esm',
        platform: native ? 'node' : 'browser',
        conditions: native ? ['react-native'] : [],
        metafile: true,
        external: ['expo-audio', 'expo-video', 'react-native', 'react', 'react/jsx-runtime'],
      })
      const imports = Object.values(result.metafile.outputs).flatMap((output) =>
        output.imports.map((entry) => entry.path),
      )
      if (native) {
        assert.ok(imports.includes(audio ? 'expo-audio' : 'expo-video'))
        assert.ok(!imports.includes(audio ? 'expo-video' : 'expo-audio'))
      } else assert.ok(!imports.some((entry) => /expo-|react-native/.test(entry)))
    }
})

test('published WebVTT conversion resolves without React, Native hosts or media engines', async () => {
  for (const native of [false, true]) {
    const result = await build({
      stdin: {
        contents: "export { parsePlainTextWebVTT, WebVTTParseError } from '@hozo/media/webvtt'",
        resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      },
      bundle: true,
      write: false,
      platform: native ? 'node' : 'browser',
      conditions: native ? ['react-native'] : [],
      metafile: true,
    })
    assert.deepEqual(
      Object.values(result.metafile.outputs).flatMap((output) => output.imports),
      [],
    )
    assert.ok(
      !Object.keys(result.metafile.inputs).some((file) =>
        /node_modules|captions\.(native\.)?js/.test(file),
      ),
    )
  }
})

test('published captions load neither playback engine on either platform', async () => {
  for (const native of [false, true]) {
    const result = await build({
      stdin: {
        contents:
          "export { MediaCaptions, MediaCaptionSelector, useWebVTTCaptions } from '@hozo/media/captions'",
        resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      },
      bundle: true,
      write: false,
      platform: native ? 'node' : 'browser',
      conditions: native ? ['react-native'] : [],
      metafile: true,
      external: ['expo-audio', 'expo-video', 'react-native', 'react', 'react/jsx-runtime'],
    })
    const imports = Object.values(result.metafile.outputs).flatMap((output) =>
      output.imports.map((entry) => entry.path),
    )
    assert.ok(!imports.some((entry) => /expo-/.test(entry)))
    assert.equal(imports.includes('react-native'), native)
    assert.ok(
      Object.keys(result.metafile.inputs).some((file) =>
        file.endsWith(native ? '/captions.native.js' : '/captions.js'),
      ),
    )
  }
})

test('published seek bindings import React but no widget, Native host or playback engine', async () => {
  for (const native of [false, true]) {
    const result = await build({
      stdin: {
        contents: "export { useMediaSeek } from '@hozo/media/seek'",
        resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      },
      bundle: true,
      write: false,
      platform: native ? 'node' : 'browser',
      conditions: native ? ['react-native'] : [],
      metafile: true,
      external: ['react'],
    })
    const imports = Object.values(result.metafile.outputs).flatMap((output) =>
      output.imports.map((entry) => entry.path),
    )
    assert.deepEqual([...new Set(imports)], ['react'])
    assert.ok(
      !Object.keys(result.metafile.inputs).some((name) => /patterns|expo-|react-native/.test(name)),
    )
  }
})
