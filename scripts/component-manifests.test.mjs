import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildManifest,
  buildPackageManifest,
  serializeManifest,
  textForwardingModule,
} from '../packages/compiler/src/manifest.ts'
import { parseOwnerPackageShadow } from '../packages/compiler/src/owner-package.ts'
import { sourcePackageChannels } from './component-manifests.mjs'

test('source package channels retain public value aliases but not types, tests or stories', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-package-channels-'))
  try {
    mkdirSync(path.join(root, 'src'))
    const files = {
      'index.ts': `export { Inner as Widget, Inner, type Props } from './widget.tsx'
export type Hidden = { value: string }`,
      'widget.tsx': `throw new Error('do not execute package code');
export type Props = { className?: string }; export const Inner = 'p-4 p-2'`,
      'widget.test.ts': `const classes = 'p-96'`,
      'widget.spec.ts': `const classes = 'p-80'`,
      'widget.stories.tsx': `const classes = 'p-64'`,
      'types.d.ts': `export declare const unused: 'p-40'`,
      'widget.tsx.hozo.css': `.p-32 { padding: 8rem }`,
    }
    for (const [name, source] of Object.entries(files))
      writeFileSync(path.join(root, 'src', name), source)
    const options = await sourcePackageChannels(root, './src/index.ts')
    assert.deepEqual(options.exports, [
      { name: 'Inner', owners: [] },
      { name: 'Widget', owners: [] },
    ])
    assert.deepEqual(
      options.sources.map((row) => row.file),
      ['src/index.ts', 'src/widget.tsx'],
    )
    const manifest = buildPackageManifest({ version: 1, textForwarding: {} }, options)
    assert.deepEqual(manifest.package.candidates, ['p-2', 'p-4'])
    assert.equal(manifest.package.owners, null)
    assert.deepEqual(manifest.package.helpers, [])
    assert.equal(manifest.package.compiledByConsumer, true)
    writeFileSync(
      path.join(root, 'src', 'index.ts'),
      `export /* authored spacing */ * from './widget.tsx'`,
    )
    await assert.rejects(
      () => sourcePackageChannels(root, './src/index.ts'),
      /explicit named exports/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the published UI manifest is freshly derived and preserves all legacy text summaries', async () => {
  const dir = fileURLToPath(new URL('../packages/ui/', import.meta.url))
  const json = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const entry = path.join(dir, json.exports['.'])
  const legacy = buildManifest({ entry })
  const channels = await sourcePackageChannels(dir, json.exports['.'])
  const manifest = buildPackageManifest(legacy, channels)
  const shipped = readFileSync(path.join(dir, json.hozo.manifest), 'utf8')
  assert.equal(shipped, serializeManifest(manifest), 'run pnpm manifests after source edits')
  const normalized = parseOwnerPackageShadow(shipped)
  assert.deepEqual(normalized.textForwarding, legacy)
  assert.deepEqual(
    textForwardingModule(json.name, manifest),
    textForwardingModule(json.name, legacy),
  )
  assert.deepEqual(
    normalized.exports.map((row) => row.name),
    channels.exports.map((row) => row.name),
  )
  assert.ok(normalized.candidates.includes('bg-hozo-accent'))
  assert.equal(normalized.owners, null, 'generation is not a behavioral owner audit')
  assert.equal(Object.hasOwn(manifest.package, 'textForwarding'), false)
})
