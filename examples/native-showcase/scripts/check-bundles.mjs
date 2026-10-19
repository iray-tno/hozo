import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyExpoExport } from './export-evidence.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli')
const videoFixture = readFileSync(path.join(root, '../showcase/assets/hozo-video.mp4'))
const audioFixture = readFileSync(path.join(root, '../showcase/assets/hozo-audio.wav'))
const posterFixture = readFileSync(path.join(root, '../showcase/assets/hozo-video-poster.png'))

// Real production Metro exports run in main's integration report, not every
// PR. Separate output directories do not race the user's interactive bundle.
for (const platform of ['android', 'ios']) {
  verifyExpoExport({
    root,
    cli,
    platform,
    verify: ({ output, metadata }) => {
      const bundle = readFileSync(
        path.join(output, metadata.fileMetadata[platform].bundle),
        'utf8',
      ).replace(/\\u([\da-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      for (const label of [
        'Primitives/Shared showcase',
        'Diagnostics/Text inheritance',
        'Use runtime fallback',
        'Native text inheritance experiment',
        'Media/Video',
        'Media/Audio',
        'Animation captions',
        'Caption language',
        'Captions off',
        'English',
        '日本語',
        '紫の四角が中央に向かって動きます。',
        'Three rising tones',
        'Native audio output',
        'Play audio probe',
        'Native audio settings output',
        'Play settings probe',
        'Quarter probe volume',
        'Disable probe pitch correction',
        'Retry audio asset',
        'Retry video asset',
        'Retry poster asset',
        'Moving square, silent video',
        'Native video playback',
        'Local video pixel probe',
        'Three/Kumimono',
        'Patterns/Shared showcase',
        'UI/Shared state checks',
        'UI workspace tabs',
        'UI workspace files',
        'Show first page',
        'Show last page',
        'Email notifications',
        'Workspace sections',
        'Confirm save',
        'Add one',
        'Save profile',
        'SVG/Shared filters',
        'SVG/Filter pixels',
        'SVG pixel scene',
        'Turn filter on',
        'SVG filters',
        'Composed shadow',
        'Turn filters off',
        '組み立て',
      ]) {
        assert.ok(bundle.includes(label), `${platform}: missing story content ${label}`)
      }
      assert.ok(bundle.includes('getStorybookUI'), `${platform}: missing on-device Storybook UI`)
      assert.ok(
        bundle.includes('ExpoVideo'),
        `${platform}: media must resolve to the Native engine`,
      )
      assert.ok(
        bundle.includes('ExpoAudio'),
        `${platform}: audio must resolve to the Native engine`,
      )
      const audios = metadata.fileMetadata[platform].assets.filter((asset) => asset.ext === 'wav')
      assert.ok(
        audios.some((asset) => readFileSync(path.join(output, asset.path)).equals(audioFixture)),
        `${platform}: the exact local showcase audio was not exported`,
      )
      const videos = metadata.fileMetadata[platform].assets.filter((asset) => asset.ext === 'mp4')
      assert.ok(
        videos.some((asset) => readFileSync(path.join(output, asset.path)).equals(videoFixture)),
        `${platform}: the exact local showcase video was not exported`,
      )
      const posters = metadata.fileMetadata[platform].assets.filter((asset) => asset.ext === 'png')
      assert.ok(
        posters.some((asset) => readFileSync(path.join(output, asset.path)).equals(posterFixture)),
        `${platform}: the exact local poster was not exported`,
      )
      console.log(`[native-showcase] ${platform}: Storybook and all demo content bundled`)
    },
  })
}
