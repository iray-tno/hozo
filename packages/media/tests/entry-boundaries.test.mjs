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
