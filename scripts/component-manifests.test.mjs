import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '../packages/compiler/src/index.ts'
import {
  buildManifest,
  buildPackageManifest,
  serializeManifest,
  textForwardingModule,
} from '../packages/compiler/src/manifest.ts'
import { parseOwnerPackageShadow } from '../packages/compiler/src/owner-package.ts'
import { sourcePackageChannels } from './component-manifests.mjs'
import { ownerShadow } from './style-slots/catalog.mjs'

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
      'widget.bench.ts': `const classes = 'p-56'`,
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

test('a shared manifest refuses divergent platform value exports or text publication', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-platform-channels-'))
  try {
    mkdirSync(path.join(root, 'src'))
    const web = 'src/index.tsx',
      native = 'src/index.native.tsx'
    const source = (name, classes) => `import {Button as Host} from '@hozo/primitives'
export function ${name}({className, ...rest}) {return <Host {...rest} className="${classes}"/>}`
    writeFileSync(path.join(root, web), source('Widget', 'text-sm'))
    writeFileSync(path.join(root, native), source('Other', 'text-sm'))
    await assert.rejects(
      () => sourcePackageChannels(root, web, { nativeEntry: native }),
      /divergent.*exports/,
    )
    writeFileSync(path.join(root, native), source('Widget', 'text-lg'))
    await assert.rejects(
      () => sourcePackageChannels(root, web, { nativeEntry: native }),
      /divergent.*text/,
    )
    writeFileSync(path.join(root, native), source('Widget', 'text-sm'))
    const options = await sourcePackageChannels(root, web, {
      nativeEntry: native,
      compiledByConsumer: false,
    })
    assert.equal(options.compiledByConsumer, false)
    assert.deepEqual(options.exports, [{ name: 'Widget', owners: [] }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('patterns publishes its catalog-owned contract without cloning it onto the UI facade', async () => {
  const dir = fileURLToPath(new URL('../packages/patterns/', import.meta.url))
  const json = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const options = await sourcePackageChannels(dir, './src/index.ts', {
    packageName: json.name,
    nativeEntry: './src/index.native.ts',
    compiledByConsumer: false,
  })
  const legacy = buildManifest({ entry: path.join(dir, 'src/index.ts') })
  const manifest = buildPackageManifest(legacy, options)
  assert.equal(
    readFileSync(path.join(dir, json.hozo.manifest), 'utf8'),
    serializeManifest(manifest),
  )
  assert.deepEqual(manifest.package.owners, ownerShadow)
  for (const name of ['BottomSheet', 'HozoBottomSheet'])
    assert.deepEqual(manifest.package.exports.find((row) => row.name === name).owners, [
      'BottomSheet.handle',
    ])
  for (const name of ['Tabs', 'HozoTabs'])
    assert.deepEqual(manifest.package.exports.find((row) => row.name === name).owners, ['Tabs.Tab'])
  assert.equal(manifest.package.compiledByConsumer, false)
  assert.deepEqual(manifest.textForwarding, {})
  const compiler = createCompiler()
  const source = `import {Tabs} from '@hozo/patterns';
export const App=()=> <Tabs tabs={tabs} tabClassName="p-2 hover:text-red-500"/>`
  const ordinary = compiler.compileNativeModule(source)
  compiler.setTextForwarding([textForwardingModule(json.name, manifest)])
  assert.deepEqual(compiler.compileNativeModule(source), ordinary)
  assert.equal(JSON.stringify(ordinary).includes('hozoTabStyle'), false)
  const ui = fileURLToPath(new URL('../packages/ui/', import.meta.url))
  const uiOptions = await sourcePackageChannels(ui, './src/index.ts', { packageName: '@hozo/ui' })
  assert.equal(uiOptions.owners, null)
  assert.ok(uiOptions.exports.every((row) => row.owners.length === 0))
  assert.equal(uiOptions.compiledByConsumer, true)
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
