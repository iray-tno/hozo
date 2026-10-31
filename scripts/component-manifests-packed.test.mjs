// Release-shaped transport proof, not an application install/device test.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { globSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { openCandidateCache } from '../packages/compiler/src/index.ts'
import {
  buildManifest,
  buildPackageManifest,
  serializeManifest,
  textForwardingModule,
} from '../packages/compiler/src/manifest.ts'
import {
  captureOwnerManifests,
  collectOwnerPackageContributions,
  readResolvedOwnerManifest,
  withOwnerPackageCandidates,
} from '../packages/compiler/src/project.ts'
import { fixtureNode } from '../packages/metro/fixtures/fixture-process.mjs'
import { sourcePackageChannels } from './component-manifests.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))

test('the real pnpm UI tarball carries reproducible candidate and legacy text channels', {
  timeout: 30000,
}, async (t) => {
  const artifacts = path.join(root, 'artifacts')
  mkdirSync(artifacts, { recursive: true })
  const work = mkdtempSync(path.join(artifacts, 'ui-manifest-pack-'))
  // Only the exact directory created by this test is ever removed.
  assert.equal(path.dirname(path.resolve(work)), path.resolve(artifacts))
  t.after(() => rmSync(work, { recursive: true, force: true }))
  const packed = path.join(work, 'packed')
  try {
    await fixtureNode(
      [
        fileURLToPath(new URL('./pack-npm.mjs', import.meta.url)),
        '--target',
        '@hozo/ui',
        '--destination',
        packed,
      ],
      root,
      { signal: t.signal },
    )
  } catch (error) {
    throw new Error(`UI package production failed\n${error.stdout ?? ''}\n${error.stderr ?? ''}`, {
      cause: error,
    })
  }
  const [archive] = globSync('*.tgz', { cwd: packed })
  assert.ok(archive, 'the real publication packer must produce a tarball')
  assert.equal(globSync('*.tgz', { cwd: packed }).length, 1)
  const tarball = path.join(packed, archive)
  const unpacked = path.join(work, 'unpacked')
  mkdirSync(unpacked)
  execFileSync('tar', ['-xzf', tarball, '-C', unpacked], { timeout: 15000 })
  const instance = realpathSync(path.join(unpacked, 'package'))
  const json = JSON.parse(readFileSync(path.join(instance, 'package.json'), 'utf8'))
  assert.equal(json.name, '@hozo/ui')
  assert.equal(json.hozo.manifest, json.exports['./hozo.manifest.json'])
  assert.ok(Object.values(json.dependencies).every((version) => !version.startsWith('workspace:')))
  const entry = path.join(instance, json.exports['.'])
  const channels = await sourcePackageChannels(instance, json.exports['.'])
  const sourceFiles = globSync('src/**/*.{ts,tsx}', { cwd: instance })
    .map((file) => file.replaceAll('\\', '/'))
    .sort()
  assert.deepEqual(
    sourceFiles,
    channels.sources.map((row) => row.file),
  )
  assert.equal(globSync('src/**/*.hozo.css', { cwd: instance }).length, 0)
  const manifestFile = path.join(instance, json.hozo.manifest)
  const text = readFileSync(manifestFile, 'utf8')
  assert.equal(text, readFileSync(path.join(root, 'packages/ui', json.hozo.manifest), 'utf8'))
  const legacy = buildManifest({ entry })
  const regenerated = buildPackageManifest(legacy, channels)
  assert.equal(
    text,
    serializeManifest(regenerated),
    'reproduce from tarball sources, not workspace sources',
  )
  assert.deepEqual(
    textForwardingModule(json.name, regenerated),
    textForwardingModule(json.name, legacy),
  )

  // Exercise the consumer's real bounded filesystem reader and contribution
  // path. Package exports/text/helpers remain instance-scoped, never globals.
  const edge = { importer: path.join(unpacked, 'App.tsx'), specifier: json.name }
  const observation = readResolvedOwnerManifest(edge, {
    packageRoot: instance,
    entry,
    declaredManifest: json.hozo.manifest,
  })
  const capture = captureOwnerManifests([edge], [observation], {
    platform: 'ios',
    epoch: 'packed-ui-proof',
  })
  const contributions = collectOwnerPackageContributions(capture)
  assert.equal(contributions.status, 'complete')
  if (contributions.status !== 'complete') return
  assert.deepEqual(contributions.candidates, regenerated.package.candidates)
  assert.equal(contributions.instances[0].instance, instance)
  assert.deepEqual(contributions.instances[0].entries, [realpathSync(entry)])
  assert.equal(contributions.instances[0].data.owners, null)

  const scanned = openCandidateCache()
  for (const source of channels.sources) scanned.scanFile(source.file, source.source, 0)
  const consumed = withOwnerPackageCandidates(
    { cache: openCandidateCache(), files: [] },
    contributions,
  )
  assert.deepEqual(consumed.candidates(), scanned.candidates())
  assert.equal(consumed.renderCss(), scanned.renderCss())
  assert.equal(consumed.renderNativeModule(), scanned.renderNativeModule())
  assert.ok(consumed.candidates().includes('p-4'))
  t.diagnostic(
    JSON.stringify({
      sourceFiles: sourceFiles.length,
      exports: regenerated.package.exports.length,
      candidates: contributions.candidates.length,
      textSummaries: Object.keys(legacy.textForwarding).length,
      manifestBytes: Buffer.byteLength(text),
      tarballBytes: readFileSync(tarball).length,
      tarballSha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
      scope: 'pack-read-regenerate-and-candidate-codegen; not app install or device',
    }),
  )
})
