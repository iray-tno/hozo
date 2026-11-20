// #2047 on Vite: package manifests captured at buildStart supply candidates,
// a module loaded from an uncaptured package with a manifest fails the build,
// and so does an incomplete capture (decision 012 point 4, as amended).

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build } from 'vite'
import { buildPackageManifest, serializeManifest } from '../../compiler/src/manifest.ts'
import { runManifestCli } from '../../compiler/src/manifest-command.ts'
import { type HozoOptions, hozo } from './index.ts'

function manifest(classes: string, compiledByConsumer = true) {
  return serializeManifest(
    buildPackageManifest(
      { version: 1, textForwarding: {} },
      {
        exports: [],
        owners: null,
        helpers: [],
        compiledByConsumer,
        sources: [{ file: 'src/index.tsx', source: `export const x = "${classes}"` }],
      },
    ),
  )
}

function install(
  root: string,
  name: string,
  classes: string,
  declared = './hozo.manifest.json',
  source?: string,
) {
  const dir = path.join(root, 'node_modules', name)
  mkdirSync(path.join(dir, 'src'), { recursive: true })
  writeFileSync(path.join(dir, 'index.js'), 'export const kit = 1\n')
  // A package that ships source for its consumer to compile, as @hozo/ui does.
  if (source) writeFileSync(path.join(dir, 'src', 'index.tsx'), source)
  writeFileSync(path.join(dir, 'hozo.manifest.json'), manifest(classes, source !== undefined))
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      type: 'module',
      main: source ? 'src/index.tsx' : 'index.js',
      hozo: { manifest: declared },
    }),
  )
}

function fixture(t, dependencies: Record<string, string>, imports: string[] = []) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-vite-carriers-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies }))
  writeFileSync(
    path.join(root, 'entry.tsx'),
    `${imports.map((name) => `import '${name}'`).join('\n')}\n` +
      `import {View} from '@hozo/core';export const App=()=> <View className="p-4"/>`,
  )
  writeFileSync(path.join(root, 'tokens.css'), '@theme {--spacing:.25rem;} @tailwind utilities;')
  return root
}

async function tinyBuild(root: string, options: HozoOptions = {}) {
  const warnings: string[] = []
  output = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    customLogger: {
      info() {},
      warn: (message: string) => warnings.push(message),
      warnOnce() {},
      error() {},
      clearScreen() {},
      hasErrorLogged: () => false,
      hasWarned: false,
    },
    plugins: [hozo({ root, css: 'tokens.css', ...options })],
    build: {
      write: false,
      lib: { entry: path.join(root, 'entry.tsx'), formats: ['es'], cssFileName: 'fixture' },
      rolldownOptions: { external: ['react/jsx-runtime', '@hozo/core'] },
    },
  })
  return warnings
}

let output: unknown
const candidates = (root: string) =>
  readFileSync(path.join(root, 'node_modules', '.hozo', 'candidates.css'), 'utf8')
// The compiled stylesheet the last build emitted.
const emittedCss = () =>
  (Array.isArray(output) ? output : [output])
    .flatMap((result) => result.output)
    .filter((asset) => asset.type === 'asset' && asset.fileName.endsWith('.css'))
    .map((asset) => String(asset.source))
    .join('\n')

test('an installed package with a manifest contributes its candidates, without its sources', async (t) => {
  const root = fixture(t, { kit: '1' }, ['kit'])
  install(root, 'kit', 'gap-7')
  await tinyBuild(root)
  assert.match(candidates(root), /gap-7/)
})

test('source a package with a manifest ships for its consumer is compiled from node_modules', async (t) => {
  // Not `@hozo/*`, so the source walk never listed it, and Vite only
  // transforms what is admitted under node_modules.
  const root = fixture(t, { kit: '1' }, ['kit'])
  // `gap-9` is in the source only, so only compiling that file can emit it.
  install(
    root,
    'kit',
    'gap-7',
    undefined,
    `import {View} from '@hozo/core';export const Kit=()=> <View className="gap-9"/>`,
  )
  await tinyBuild(root)
  assert.match(emittedCss(), /gap:36px/)
})

test('an explicit content.packages keeps the scan it names instead', async (t) => {
  const root = fixture(t, { kit: '1' }, ['kit'])
  install(root, 'kit', 'gap-7')
  await tinyBuild(root, { content: { packages: [] } })
  assert.doesNotMatch(candidates(root), /gap-7/)
})

test('loading a package with a manifest outside the capture fails the build', async (t) => {
  const root = fixture(t, { kit: '1' }, ['kit', 'late'])
  install(root, 'kit', 'gap-7')
  install(root, 'late', 'gap-9')
  await assert.rejects(
    tinyBuild(root),
    /late .*declares a Hozo manifest.*Add late to the dependencies/s,
  )
})

test('an incomplete capture fails the build before output, naming the package', async (t) => {
  const root = fixture(t, { kit: '1', broken: '1' }, ['kit'])
  install(root, 'kit', 'gap-7')
  install(root, 'broken', 'gap-5', './gone.json')
  await assert.rejects(
    tinyBuild(root),
    /manifests captured at startup are incomplete.*missing-manifest: broken/s,
  )
})

test('a manifest from `hozo manifest --sources` contributes candidates and compiles its source, with no content.packages', async (t) => {
  // #2112: a third-party author's own command, on the source they publish.
  const root = fixture(t, { kit: '1' }, ['kit'])
  const dir = path.join(root, 'node_modules', 'kit')
  mkdirSync(path.join(dir, 'src'), { recursive: true })
  writeFileSync(
    path.join(dir, 'src', 'index.tsx'),
    "import {View} from '@hozo/core';const tone = 'gap-7';" +
      'export const Kit=()=> <View className="gap-9"/>;export const t = tone',
  )
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'kit',
      type: 'module',
      main: 'src/index.tsx',
      hozo: { manifest: './hozo.manifest.json' },
    }),
  )
  const io = { log() {}, error: (message: string) => assert.fail(message) }
  assert.equal(
    runManifestCli([dir, '--sources', 'src/**/*.tsx', '--compiled-by-consumer'], root, io),
    0,
  )
  await tinyBuild(root)
  // From the manifest's candidates, and from compiling the source it admits.
  assert.match(candidates(root), /gap-7/)
  assert.match(emittedCss(), /gap:36px/)
})

test('a v1 manifest, as hozo manifest writes it without --sources, contributes no candidates and is no error', async (t) => {
  const root = fixture(t, { kit: '1', legacy: '1' }, ['kit', 'legacy'])
  install(root, 'kit', 'gap-7')
  install(root, 'legacy', 'gap-5')
  writeFileSync(
    path.join(root, 'node_modules', 'legacy', 'hozo.manifest.json'),
    serializeManifest({ version: 1, textForwarding: {} }),
  )
  // `legacy` loads: it is a captured carrier, with nothing to contribute.
  await tinyBuild(root)
  assert.match(candidates(root), /gap-7/)
  assert.doesNotMatch(candidates(root), /gap-5/)
})
