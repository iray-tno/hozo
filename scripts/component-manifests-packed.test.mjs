// Release-shaped transport proof, not an application install/device test.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
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
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
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
  selectOwnerPackageContract,
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

test('packed Tabs callers retain per-instance provenance, stateful carriers and author evaluation', {
  timeout: 30000,
}, async (t) => {
  const { instance, json, unpacked } = await packedPackage(t, 'patterns')
  const manifestFile = path.join(instance, json.hozo.manifest)
  const text = readFileSync(manifestFile, 'utf8')
  const manifest = JSON.parse(text)
  const tab = manifest.package.owners.contracts.find((row) => row.owner === 'Tabs.Tab')
  assert.equal(tab.audit, 'unknown')
  assert.equal(selectOwnerShape(tab, { present: false }).status, 'absent')
  assert.equal(selectOwnerShape(tab, { present: true }).shape.id, 'tab')

  // A second installation with deliberately stripped Tabs metadata is a
  // negative fixture, not a claim about another published patterns version.
  const second = path.join(unpacked, 'other-install')
  cpSync(instance, second, { recursive: true })
  const stripped = structuredClone(manifest)
  stripped.package.owners.contracts = stripped.package.owners.contracts.filter(
    (row) => row.owner !== tab.owner,
  )
  for (const row of stripped.package.exports)
    row.owners = row.owners.filter((owner) => owner !== tab.owner)
  writeFileSync(path.join(second, json.hozo.manifest), JSON.stringify(stripped))

  const consumer = path.join(unpacked, 'tab-consumer')
  mkdirSync(consumer)
  writeFileSync(
    path.join(consumer, 'global.css'),
    '@import "tailwindcss"; @theme { --spacing: 7px; }',
  )
  const css = await loadProjectTailwindSnapshot(consumer)
  const edges = ['App.tsx', 'Alias.tsx', 'Nested.tsx'].map((file) => ({
    importer: path.join(consumer, file),
    specifier: json.name,
  }))
  const installations = [instance, instance, second]
  const observations = () =>
    edges.map((edge, index) =>
      readResolvedOwnerManifest(edge, {
        packageRoot: installations[index],
        entry: path.join(installations[index], json.exports['.']['react-native'].default),
        declaredManifest: json.hozo.manifest,
      }),
    )
  const capture = () =>
    captureOwnerManifests(edges, observations(), {
      platform: 'ios',
      epoch: `packed-tabs:${css.fingerprint}`,
    })
  const epoch = new OwnerManifestEpoch()
  epoch.adopt(capture())
  const lease = epoch.lease()
  const request = (at, imported = 'Tabs') => ({
    ...edges[at],
    entry: realpathSync(path.join(installations[at], json.exports['.']['react-native'].default)),
    imported,
    classProp: 'tabClassName',
  })
  for (const imported of ['Tabs', 'HozoTabs']) {
    const selected = selectOwnerPackageContract(lease, request(0, imported))
    assert.equal(selected.status, 'selected')
    assert.deepEqual(JSON.parse(selected.shadow), {
      schema: manifest.package.owners.schema,
      contracts: [tab],
    })
    assert.equal(selected.identity.owner, 'Tabs.Tab')
  }
  assert.deepEqual(selectOwnerPackageContract(lease, request(2)), {
    status: 'unassessed',
    reason: 'owner-not-declared',
  })
  assert.deepEqual(selectOwnerPackageContract(lease, request(0, 'BottomSheet')), {
    status: 'unassessed',
    reason: 'owner-not-declared',
  })

  const classes =
    'p-2 text-[18px] text-[#112233] aria-selected:text-[#223344] disabled:opacity-50 disabled:font-bold hover:tracking-[1px]'
  const source = (imported = 'Tabs', props = `tabClassName="${classes}"`) =>
    `import {${imported} as Choices} from '@hozo/patterns';
export function App({tabs,index,author}) {return <Choices tabs={tabs} index={index} tabStyle={author.value} ${props}/>}`
  let preparations = 0
  const compiler = createCompiler(css.theme, [...DEFAULT_PRIMITIVE_SOURCES])
  // The project must use retained preparation, not the old direct fallback.
  compiler.compileNativeModule = () => {
    throw new Error('no direct fallback')
  }
  compiler.setTailwindOrder = () => {
    throw new Error('no mutable order setter')
  }
  const project = new InstanceOwnerCallerProject(lease, compiler, async (names, signal) => {
    preparations++
    if (preparations === 1) assert.ok(classes.split(' ').every((token) => names.includes(token)))
    assert.ok(manifest.package.candidates.every((token) => names.includes(token)))
    return JSON.stringify((await css.prepareOrder(names, signal)).snapshot)
  })
  const receipts = []
  try {
    const first = await project.emit(source(), request(0))
    const alias = await project.emit(source('HozoTabs'), request(1, 'HozoTabs'))
    assert.equal(preparations, 1, 'both aliases use the existing exact-context cache')
    assert.equal(first.preview.contextFingerprint, alias.preview.contextFingerprint)
    for (const [result, imported] of [
      [first, 'Tabs'],
      [alias, 'HozoTabs'],
    ]) {
      assert.equal(result.identity.instance, instance)
      assert.equal(result.identity.manifestSha256, createHash('sha256').update(text).digest('hex'))
      assert.equal(result.identity.imported, imported)
      assert.equal(result.identity.owner, tab.owner)
      assert.equal(result.preview.findings[0].disposition, 'prepared-literal')
      assert.doesNotMatch(result.preview.code, /tabClassName=|hozoClasses|HozoPressable/)
      let creates = 0,
        authorReads = 0
      const sentinel = Object.freeze({ imported })
      const module = { exports: {} }
      const code = transformSync(result.preview.code, {
        loader: 'tsx',
        format: 'cjs',
        jsxFactory: 'element',
      }).code
      runInNewContext(code, {
        module,
        exports: module.exports,
        element: (type, props) => ({ type, props }),
        require(name) {
          if (name === json.name) return { [imported]: sentinel }
          assert.equal(name, 'react-native')
          return {
            StyleSheet: {
              create(styles) {
                creates++
                for (const value of Object.values(styles)) Object.freeze(value)
                return Object.freeze(styles)
              },
            },
          }
        },
      })
      const authored = Object.freeze([false, Object.freeze({ opacity: 0.8 })])
      const author = {
        get value() {
          authorReads++
          return authored
        },
      }
      assert.equal(authorReads, 0, 'a module hoist cannot read an author')
      const a = module.exports.App({ tabs: [], index: 0, author })
      const b = module.exports.App({ tabs: [], index: 1, author })
      assert.equal(a.type, sentinel, 'preserve the actual imported component, not a fake host')
      assert.equal(a.props.tabStyle, authored)
      assert.equal(a.props.hozoTabStyle, b.props.hozoTabStyle)
      assert.equal(authorReads, 2, 'one authored prop evaluation per caller render')
      assert.equal(creates, 1)
      const flatten = (value) =>
        Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value || {}
      const states = [
        {},
        { 'aria-selected': true },
        { disabled: true },
        { hovered: true },
        { 'aria-selected': true, disabled: true, hovered: true },
      ]
      for (const current of states) {
        const state = {
          pressed: false,
          hovered: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-selected': false,
          'aria-disabled': false,
          ...current,
        }
        const style = flatten(a.props.hozoTabStyle(state))
        assert.equal(style.paddingTop, 14)
        assert.equal(style.fontSize, 18)
        assert.equal(style.color, current['aria-selected'] ? '#223344' : '#112233')
        assert.equal(style.opacity ?? 1, current.disabled ? 0.5 : 1)
        assert.equal(style.fontWeight ?? '400', current.disabled ? '700' : '400')
        assert.equal(style.letterSpacing ?? 0, current.hovered ? 1 : 0)
      }
      assert.equal(authorReads, 2, 'the class callback must not capture or read authored styles')
      receipts.push({
        imported,
        evaluatedStates: states.length,
        creates,
        authorReads,
        fingerprint: result.preview.contextFingerprint,
      })
    }
    await assert.rejects(project.emit(source(), request(2)), /owner-not-declared/)
    // Dynamic residuals and unsupported relative text remain whole authored
    // calls, even when metadata and Tailwind context are otherwise complete.
    for (const props of ['tabClassName={input.value}', 'tabClassName="text-[2em]"']) {
      const input = source('Tabs', props)
      assert.equal((await project.emit(input, request(0))).preview.code, input)
    }
    const leaseChanged = structuredClone(manifest)
    leaseChanged.package.owners.contracts.find(
      (row) => row.owner === tab.owner,
    ).shapes[0].inputs.splitText = false
    writeFileSync(manifestFile, JSON.stringify(leaseChanged))
    assert.throws(() => epoch.adopt(capture()), /INVALIDATED/)
    await assert.rejects(project.emit(source(), request(0)), /INVALIDATED/)
    assert.notEqual(readFileSync(manifestFile, 'utf8'), text)
    t.diagnostic(
      JSON.stringify({
        scope:
          'packed Tabs instance selection and compiler-carrier evaluation; not a host/device audit',
        aliases: receipts,
        sameNameInstances: 2,
        initiallySharedPreparations: 1,
        missingOwnerRejected: true,
        metadataChangeRetiredLease: true,
      }),
    )
  } finally {
    project.invalidate()
  }
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

  const contract = manifest.package.owners.contracts.find(
    (row) => row.owner === 'BottomSheet.handle',
  )
  assert.equal(contract.audit, 'unknown')
  assert.equal(selectOwnerShape(contract, { present: false }).status, 'absent')
  for (const resizable of [false, true]) {
    const selection = selectOwnerShape(contract, { present: true, resizable })
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
    const options = {
      source: json.name,
      imported,
      shadow: JSON.stringify({ schema: manifest.package.owners.schema, contracts: [contract] }),
    }
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
  const webEntry = realpathSync(path.join(instance, json.exports['.'].default))
  const webEpoch = new OwnerManifestEpoch()
  webEpoch.adopt(
    captureOwnerManifests(
      edges,
      edges.map((edge) =>
        readResolvedOwnerManifest(edge, {
          packageRoot: instance,
          entry: webEntry,
          declaredManifest: json.hozo.manifest,
        }),
      ),
      { platform: 'web', epoch: `packed-web-owner:${css.fingerprint}` },
    ),
  )
  let webPreparations = 0
  const webCompiler = createCompiler(css.theme, [...DEFAULT_PRIMITIVE_SOURCES])
  webCompiler.prepareNativeModule = () => {
    throw new Error('not a Native owner request')
  }
  const webProject = new InstanceOwnerCallerProject(
    webEpoch.lease(),
    webCompiler,
    async (names, signal) => {
      webPreparations++
      assert.ok(manifest.package.candidates.every((name) => names.includes(name)))
      return JSON.stringify((await css.prepareOrder(names, signal)).snapshot)
    },
  )
  const webReceipts = []
  try {
    for (const [index, imported] of ['Tabs', 'HozoTabs'].entries()) {
      const input = `import {${imported} as Choices} from '@hozo/patterns';export const App=()=> <Choices tabs={tabs} tabClassName="p-2 text-[18px] aria-selected:bg-[#223344] disabled:opacity-50 hover:tracking-[1px]"/>`
      const result = await webProject.emit(input, {
        ...edges[index],
        entry: webEntry,
        imported,
        classProp: 'tabClassName',
      })
      assert.equal(result.preview.findings[0].disposition, 'prepared-literal')
      assert.match(result.preview.css, /padding-top: 14px/)
      assert.match(result.preview.css, /aria-selected/)
      assert.match(result.preview.css, /font-size: 18px/)
      assert.doesNotMatch(result.preview.code, /react-native|hozoTabStyle/)
      assert.equal(result.identity.platform, 'web')
      assert.equal(result.identity.entry, webEntry)
      assert.equal(result.identity.instance, instance)
      assert.equal(result.identity.owner, 'Tabs.Tab')
      assert.equal(result.identity.manifestSha256, createHash('sha256').update(text).digest('hex'))
      webReceipts.push({
        imported,
        fingerprint: result.preview.contextFingerprint,
        cssBytes: Buffer.byteLength(result.preview.css),
      })
    }
    assert.equal(webPreparations, 1)
    assert.equal(webReceipts[0].fingerprint, webReceipts[1].fingerprint)
    t.diagnostic(
      JSON.stringify({
        scope: 'actual packed Web entry and instance-selected caller CSS; not browser execution',
        webPreparations,
        aliases: webReceipts,
      }),
    )
  } finally {
    webProject.invalidate()
  }
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
