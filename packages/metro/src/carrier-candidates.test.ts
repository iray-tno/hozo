// #2047: a package's manifest supplies its candidates at config load, a late
// package with a manifest fails the build before output, and an incomplete
// capture leaves the whole build on the ordinary route.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildPackageManifest, serializeManifest } from '../../compiler/src/manifest.ts'
import { withHozo } from './config.ts'

const APP = `import { View } from '@hozo/core'\nexport const App = () => <View className="p-4" />\n`

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
  writeFileSync(path.join(dir, 'index.js'), 'module.exports = {}\n')
  writeFileSync(path.join(dir, 'hozo.manifest.json'), manifest(classes))
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name, main: 'index.js', hozo: { manifest: declared } }),
  )
  return realpathSync(dir)
}

async function project(
  dependencies: Record<string, string>,
  setup: (root: string) => void,
  run: (root: string, config: Awaited<ReturnType<typeof withHozo>>) => void,
  options: Parameters<typeof withHozo>[1] = {},
) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'hozo-metro-carriers-')))
  const warn = console.warn
  try {
    mkdirSync(path.join(root, 'src'))
    writeFileSync(path.join(root, 'src', 'App.tsx'), APP)
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies }))
    setup(root)
    console.warn = () => {}
    run(root, await withHozo({ projectRoot: root }, options))
  } finally {
    console.warn = warn
    rmSync(root, { recursive: true, force: true })
  }
}

const candidates = (root: string) =>
  readFileSync(path.join(root, 'node_modules', '.hozo', 'candidates.native.js'), 'utf8')

function resolveInto(config: Awaited<ReturnType<typeof withHozo>>, root: string, file: string) {
  return config.resolver.resolveRequest(
    {
      originModulePath: path.join(root, 'src', 'App.tsx'),
      resolveRequest: () => ({ type: 'sourceFile', filePath: file }),
    },
    'whatever',
    'android',
  )
}

test('an installed package with a manifest contributes its candidates, without its sources', async () => {
  // `kit` is not `@hozo/*` and ships no source: before #2047 nothing read it.
  await project(
    { kit: '1' },
    (root) => install(root, 'kit', 'gap-7'),
    (root) => assert.match(candidates(root), /"gap-7"/),
  )
})

test('an explicit content.packages keeps the scan it names instead', async () => {
  await project(
    { kit: '1' },
    (root) => install(root, 'kit', 'gap-7'),
    (root) => assert.doesNotMatch(candidates(root), /"gap-7"/),
    { content: { packages: [] } },
  )
})

test('a resolution into a package with a manifest outside the capture fails the build', async () => {
  await project(
    { kit: '1' },
    (root) => {
      install(root, 'kit', 'gap-7')
      install(root, 'late', 'gap-9')
    },
    (root, config) => {
      // Captured, and an ordinary package nobody declared: both pass.
      const kit = path.join(root, 'node_modules', 'kit', 'index.js')
      assert.deepEqual(resolveInto(config, root, kit), { type: 'sourceFile', filePath: kit })
      writeFileSync(path.join(root, 'plain.js'), '')
      resolveInto(config, root, path.join(root, 'plain.js'))
      assert.throws(
        () => resolveInto(config, root, path.join(root, 'node_modules', 'late', 'index.js')),
        /late .*declares a Hozo manifest.*Add late to the dependencies/s,
      )
      assert.doesNotMatch(candidates(root), /"gap-9"/)
    },
  )
})

test('an incomplete capture keeps the whole build on the ordinary route', async () => {
  await project(
    { kit: '1', broken: '1' },
    (root) => {
      install(root, 'kit', 'gap-7')
      install(root, 'broken', 'gap-5', './gone.json')
      install(root, 'late', 'gap-9')
    },
    (root, config) => {
      // Not even the complete carrier's candidates: whole or not at all.
      assert.doesNotMatch(candidates(root), /"gap-7"/)
      // And no guard, since nothing was frozen to guard.
      const late = path.join(root, 'node_modules', 'late', 'index.js')
      assert.deepEqual(resolveInto(config, root, late), { type: 'sourceFile', filePath: late })
    },
  )
})
