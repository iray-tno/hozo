// #2047 on Vite: package manifests captured at buildStart supply candidates,
// a module loaded from an uncaptured package with a manifest fails the build,
// and an incomplete capture keeps the whole build on the ordinary route.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build } from 'vite'
import { buildPackageManifest, serializeManifest } from '../../compiler/src/manifest.ts'
import { type HozoOptions, hozo } from './index.ts'

function manifest(classes: string) {
  return serializeManifest(
    buildPackageManifest(
      { version: 1, textForwarding: {} },
      {
        exports: [],
        owners: null,
        helpers: [],
        compiledByConsumer: true,
        sources: [{ file: 'src/index.tsx', source: `export const x = "${classes}"` }],
      },
    ),
  )
}

function install(root: string, name: string, classes: string, declared = './hozo.manifest.json') {
  const dir = path.join(root, 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'index.js'), 'export const kit = 1\n')
  writeFileSync(path.join(dir, 'hozo.manifest.json'), manifest(classes))
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name, type: 'module', main: 'index.js', hozo: { manifest: declared } }),
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
  await build({
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

const candidates = (root: string) =>
  readFileSync(path.join(root, 'node_modules', '.hozo', 'candidates.css'), 'utf8')

test('an installed package with a manifest contributes its candidates, without its sources', async (t) => {
  const root = fixture(t, { kit: '1' }, ['kit'])
  install(root, 'kit', 'gap-7')
  await tinyBuild(root)
  assert.match(candidates(root), /gap-7/)
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

test('an incomplete capture keeps the whole build on the ordinary route', async (t) => {
  const root = fixture(t, { kit: '1', broken: '1' }, ['kit', 'late'])
  install(root, 'kit', 'gap-7')
  install(root, 'broken', 'gap-5', './gone.json')
  install(root, 'late', 'gap-9')
  // No guard, so `late` loads; and not even the complete carrier's candidates.
  const warnings = await tinyBuild(root)
  assert.doesNotMatch(candidates(root), /gap-7/)
  assert.ok(warnings.some((message) => /package manifests incomplete/.test(message)))
})
