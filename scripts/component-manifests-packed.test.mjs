// Release-shaped transport proof, not an application install/device test.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler, openCandidateCache } from '../packages/compiler/src/index.ts'
import {
  buildManifest,
  buildPackageManifest,
  serializeManifest,
  textForwardingModule,
} from '../packages/compiler/src/manifest.ts'
import { previewOwnerLiteralCallers } from '../packages/compiler/src/owner-caller-plan.ts'
import { selectOwnerShape } from '../packages/compiler/src/owner-contract.ts'
import {
  captureOwnerManifests,
  collectOwnerPackageContributions,
  InstanceOwnerCallerProject,
  OwnerManifestEpoch,
  readResolvedOwnerManifest,
  withOwnerPackageCandidates,
} from '../packages/compiler/src/project.ts'
import { DEFAULT_PRIMITIVE_SOURCES } from '../packages/compiler/src/sources.ts'
import { fixtureNode } from '../packages/metro/fixtures/fixture-process.mjs'
import { loadProjectTailwindSnapshot } from '../packages/tailwind/src/project-snapshot.ts'
import { sourcePackageChannels } from './component-manifests.mjs'
import { valueExports } from './generated-abi.mjs'
import { ownerShadow } from './style-slots/catalog.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))

async function packedPackage(t, name) {
  const artifacts = path.join(root, 'artifacts')
  mkdirSync(artifacts, { recursive: true })
  const work = mkdtempSync(path.join(artifacts, `${name}-manifest-pack-`))
  // Only the exact directory created by this test is ever removed.
  assert.equal(path.dirname(path.resolve(work)), path.resolve(artifacts))
  t.after(() => rmSync(work, { recursive: true, force: true }))
  const packed = path.join(work, 'packed')
  try {
    await fixtureNode(
      [
        fileURLToPath(new URL('./pack-npm.mjs', import.meta.url)),
        '--target',
        `@hozo/${name}`,
        '--destination',
        packed,
      ],
      root,
      { signal: t.signal },
    )
  } catch (error) {
    throw new Error(
      `${name} package production failed\n${error.stdout ?? ''}\n${error.stderr ?? ''}`,
      {
        cause: error,
      },
    )
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
  assert.equal(json.name, `@hozo/${name}`)
  assert.equal(json.hozo.manifest, json.exports['./hozo.manifest.json'])
  assert.ok(Object.values(json.dependencies).every((version) => !version.startsWith('workspace:')))
  return { instance, json, unpacked, tarball }
}

test('the real pnpm UI tarball carries reproducible candidate and legacy text channels', {
  timeout: 30000,
}, async (t) => {
  const { instance, json, unpacked, tarball } = await packedPackage(t, 'ui')
  const entry = path.join(instance, json.exports['.'])
  const channels = await sourcePackageChannels(instance, json.exports['.'], {
    packageName: json.name,
  })
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

test('the built patterns tarball preserves scoped owner facts for both selected entries and explicit caller preview', {
  timeout: 30000,
}, async (t) => {
  const { instance, json, unpacked, tarball } = await packedPackage(t, 'patterns')
  const channels = await sourcePackageChannels(instance, './src/index.ts', {
    packageName: json.name,
    nativeEntry: './src/index.native.ts',
    compiledByConsumer: false,
  })
  const sourceFiles = globSync('src/**/*.{ts,tsx}', { cwd: instance })
    .map((file) => file.replaceAll('\\', '/'))
    .sort()
  assert.deepEqual(
    sourceFiles,
    channels.sources.map((row) => row.file),
  )
  const legacy = buildManifest({ entry: path.join(instance, 'src/index.ts') })
  const manifest = buildPackageManifest(legacy, channels)
  const text = readFileSync(path.join(instance, json.hozo.manifest), 'utf8')
  assert.equal(text, readFileSync(path.join(root, 'packages/patterns', json.hozo.manifest), 'utf8'))
  assert.equal(text, serializeManifest(manifest))
  assert.deepEqual(
    manifest.package.owners,
    ownerShadow,
    'transport of the catalog, not a copied fixture',
  )
  assert.deepEqual(manifest.textForwarding, {})

  const captures = []
  for (const [platform, target] of [
    ['web', json.exports['.'].default],
    ['ios', json.exports['.']['react-native'].default],
  ]) {
    const entry = path.join(instance, target)
    assert.deepEqual(
      await valueExports(entry, { requireExplicit: true }),
      channels.exports.map((row) => row.name),
    )
    const edge = { importer: path.join(unpacked, 'App.tsx'), specifier: json.name }
    const observation = readResolvedOwnerManifest(edge, {
      packageRoot: instance,
      entry,
      declaredManifest: json.hozo.manifest,
    })
    const capture = captureOwnerManifests([edge], [observation], {
      platform,
      epoch: 'packed-patterns-proof',
    })
    const contributions = collectOwnerPackageContributions(capture)
    assert.equal(contributions.status, 'complete')
    if (contributions.status !== 'complete') return
    assert.deepEqual(contributions.instances[0].entries, [realpathSync(entry)])
    assert.equal(contributions.instances[0].data.compiledByConsumer, false)
    assert.deepEqual(contributions.instances[0].data.owners, ownerShadow)
    captures.push(capture)
  }
  assert.notEqual(
    captures[0].fingerprint,
    captures[1].fingerprint,
    'selected entry/platform identities stay distinct',
  )

  const contract = manifest.package.owners.contracts[0]
  assert.equal(contract.audit, 'unknown')
  assert.equal(selectOwnerShape(contract, { open: false }).status, 'absent')
  for (const resizable of [false, true]) {
    const selection = selectOwnerShape(contract, { open: true, resizable })
    assert.equal(selection.status, 'selected')
    assert.equal(selection.shape.nativeHost, resizable ? 'Pressable' : 'View')
    assert.equal(selection.shape.webHost, resizable ? 'button' : 'div')
  }

  // Explicit compiler preview only: do not install this unknown-audit contract
  // in an adapter or silently rewrite a UI/core facade based on its name.
  const compiler = createCompiler(undefined, [...DEFAULT_PRIMITIVE_SOURCES])
  const ordinarySource = `import {BottomSheet} from '@hozo/patterns'; import {Text} from '@hozo/primitives';
export const App=()=> <BottomSheet open handleClassName="p-[8px]"><Text className="text-sm">Label</Text></BottomSheet>`
  const ordinary = compiler.compileNativeModule(ordinarySource)
  assert.ok(ordinary.components.length > 0)
  compiler.setTextForwarding([textForwardingModule(json.name, manifest)])
  assert.deepEqual(compiler.compileNativeModule(ordinarySource), ordinary)
  assert.equal(
    JSON.stringify(ordinary).includes('hozoHandleStyle'),
    false,
    'publication must not activate experimental owner lowering',
  )
  for (const imported of ['BottomSheet', 'HozoBottomSheet']) {
    assert.deepEqual(manifest.package.exports.find((row) => row.name === imported).owners, [
      contract.owner,
    ])
    const source = `import {${imported} as Sheet} from '@hozo/patterns';
export const App=()=> <Sheet open handleClassName="p-[8px] opacity-50" handleStyle={authored}/>`
    const options = { source: json.name, imported, shadow: JSON.stringify(manifest.package.owners) }
    const preview = previewOwnerLiteralCallers(source, compiler, options)
    assert.equal(preview.findings[0].disposition, 'prepared-literal')
    assert.match(preview.code, /hozoHandleStyle=\{/)
    assert.match(preview.code, /paddingTop: 8/)
    assert.equal((preview.code.match(/authored/g) ?? []).length, 1)
    const stateful = source.replace('p-[8px] opacity-50', 'hover:opacity-50')
    assert.equal(previewOwnerLiteralCallers(stateful, compiler, options).code, stateful)
    const facade = source.replace('@hozo/patterns', '@hozo/ui')
    assert.equal(previewOwnerLiteralCallers(facade, compiler, options).code, facade)
  }

  // Real Tailwind preparation against the actual packed contract. The archive
  // supplies facts; the workspace compiler/Tailwind remain the tested tooling.
  const consumer = path.join(unpacked, 'consumer')
  mkdirSync(consumer)
  const stylesheet = path.join(consumer, 'global.css')
  writeFileSync(stylesheet, '@import "tailwindcss"; @theme { --spacing: 7px; }')
  const css = await loadProjectTailwindSnapshot(consumer)
  assert.equal(css.theme.spacingPx, 7)
  const edges = ['App.tsx', 'Other.tsx'].map((file) => ({
    importer: path.join(consumer, file),
    specifier: json.name,
  }))
  const nativeEntry = path.join(instance, json.exports['.']['react-native'].default)
  const observations = edges.map((edge) =>
    readResolvedOwnerManifest(edge, {
      packageRoot: instance,
      entry: nativeEntry,
      declaredManifest: json.hozo.manifest,
    }),
  )
  const capturedEpoch = (snapshot) => {
    const epoch = new OwnerManifestEpoch()
    epoch.adopt(
      captureOwnerManifests(edges, observations, {
        platform: 'ios',
        epoch: `packed-owner-current-compiler-abi:${snapshot.fingerprint}`,
      }),
    )
    return epoch
  }
  const epoch = capturedEpoch(css)
  let preparations = 0
  const project = new InstanceOwnerCallerProject(
    epoch.lease(),
    createCompiler(css.theme, [...DEFAULT_PRIMITIVE_SOURCES]),
    async (names, signal) => {
      preparations++
      assert.ok(names.includes('p-2'))
      assert.ok(manifest.package.candidates.every((name) => names.includes(name)))
      return JSON.stringify((await css.prepareOrder(names, signal)).snapshot)
    },
  )
  const request = (edge, imported = 'BottomSheet') => ({
    ...edge,
    entry: realpathSync(nativeEntry),
    imported,
    classProp: 'handleClassName',
  })
  const caller = (imported = 'BottomSheet') => `import {${imported} as Sheet} from '@hozo/patterns';
export const App=()=> <Sheet handleClassName="p-2"/>`
  let originalFingerprint
  try {
    const first = await project.emit(caller(), request(edges[0]))
    const other = await project.emit(
      caller('HozoBottomSheet'),
      request(edges[1], 'HozoBottomSheet'),
    )
    assert.match(first.preview.code, /paddingTop: 14/)
    assert.match(other.preview.code, /paddingTop: 14/)
    assert.equal(first.identity.instance, instance)
    assert.equal(first.identity.manifestSha256, createHash('sha256').update(text).digest('hex'))
    assert.equal(first.preview.contextFingerprint, other.preview.contextFingerprint)
    assert.equal(preparations, 1, 'both actual aliases share the existing ready namespace')
    originalFingerprint = first.preview.contextFingerprint
    writeFileSync(stylesheet, '@import "tailwindcss"; @theme { --spacing: 11px; }')
    const old = await project.emit(caller(), request(edges[0]))
    assert.match(
      old.preview.code,
      /paddingTop: 14/,
      'captured compiler/CSS must not read changing disk silently',
    )
    assert.equal(old.preview.contextFingerprint, originalFingerprint)
  } finally {
    project.invalidate()
  }
  await assert.rejects(project.emit(caller(), request(edges[0])), /INVALIDATED/)
  const freshCss = await loadProjectTailwindSnapshot(consumer)
  const freshEpoch = capturedEpoch(freshCss)
  const replacement = new InstanceOwnerCallerProject(
    freshEpoch.lease(),
    createCompiler(freshCss.theme, [...DEFAULT_PRIMITIVE_SOURCES]),
    async (names, signal) => JSON.stringify((await freshCss.prepareOrder(names, signal)).snapshot),
  )
  try {
    const fresh = await replacement.emit(caller(), request(edges[0]))
    assert.match(fresh.preview.code, /paddingTop: 22/)
    assert.notEqual(fresh.preview.contextFingerprint, originalFingerprint)
    assert.notEqual(fresh.identity.captureFingerprint, epoch.lease().capture.fingerprint)
    t.diagnostic(
      JSON.stringify({
        scope: 'packed contract and actual Tailwind instance-owned preview; not adapter/host audit',
        originalPadding: 14,
        replacementPadding: 22,
        capturedSpacing: 7,
        replacementSpacing: 11,
        sharedContextPreparations: preparations,
        originalFingerprint,
        replacementFingerprint: fresh.preview.contextFingerprint,
      }),
    )
  } finally {
    replacement.invalidate()
  }
  t.diagnostic(
    JSON.stringify({
      sourceFiles: sourceFiles.length,
      exports: manifest.package.exports.length,
      candidates: manifest.package.candidates.length,
      contracts: manifest.package.owners.contracts.length,
      audit: contract.audit,
      compiledByConsumer: false,
      manifestBytes: Buffer.byteLength(text),
      tarballBytes: readFileSync(tarball).length,
      tarballSha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
      scope:
        'packed default/native entry metadata, contract capture and explicit preview; not host/adapter audit',
    }),
  )
})
