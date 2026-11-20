// #2047: a package's manifest supplies its candidates at config load, a late
// package with a manifest fails the build before output, and so does an
// incomplete capture (decision 012 point 4, as amended).

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildPackageManifest, serializeManifest } from '../../compiler/src/manifest.ts'
import { runManifestCli } from '../../compiler/src/manifest-command.ts'
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

test('an incomplete capture fails at config load, naming the package', async () => {
  await assert.rejects(
    project(
      { kit: '1', broken: '1' },
      (root) => {
        install(root, 'kit', 'gap-7')
        install(root, 'broken', 'gap-5', './gone.json')
      },
      () => assert.fail('a build with part of the candidates'),
    ),
    /manifests captured at startup are incomplete.*missing-manifest: broken/s,
  )
})

test('a manifest from `hozo manifest --sources` contributes its candidates, with no content.packages', async () => {
  // #2112: a third-party author's own command, on the built output they publish.
  await project(
    { kit: '1' },
    (root) => {
      const dir = path.join(root, 'node_modules', 'kit')
      mkdirSync(path.join(dir, 'dist'), { recursive: true })
      writeFileSync(path.join(dir, 'dist', 'index.js'), 'exports.tone = "gap-9 rounded-3xl"\n')
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: 'kit',
          main: 'dist/index.js',
          hozo: { manifest: './hozo.manifest.json' },
        }),
      )
      const io = { log() {}, error: (message: string) => assert.fail(message) }
      assert.equal(runManifestCli([dir, '--sources', 'dist/**/*.js'], root, io), 0)
    },
    (root) => {
      assert.match(candidates(root), /"gap-9"/)
      assert.match(candidates(root), /"rounded-3xl"/)
    },
  )
})

test('a v1 manifest, as hozo manifest writes it without --sources, contributes no candidates and is no error', async () => {
  await project(
    { kit: '1', legacy: '1' },
    (root) => {
      install(root, 'kit', 'gap-7')
      install(root, 'legacy', 'gap-5')
      writeFileSync(
        path.join(root, 'node_modules', 'legacy', 'hozo.manifest.json'),
        serializeManifest({ version: 1, textForwarding: {} }),
      )
    },
    (root, config) => {
      assert.match(candidates(root), /"gap-7"/)
      // Still a carrier: captured, so loading it does not trip the guard.
      const legacy = path.join(root, 'node_modules', 'legacy', 'index.js')
      assert.deepEqual(resolveInto(config, root, legacy), { type: 'sourceFile', filePath: legacy })
    },
  )
})

test('a v1 manifest from an @hozo package is a mismatched release, and fails', async () => {
  await assert.rejects(
    project(
      { '@hozo/old': '1' },
      (root) => {
        install(root, '@hozo/old', 'gap-5')
        writeFileSync(
          path.join(root, 'node_modules', '@hozo', 'old', 'hozo.manifest.json'),
          serializeManifest({ version: 1, textForwarding: {} }),
        )
      },
      () => assert.fail('an @hozo package silently without candidates'),
    ),
    /package-channels-unavailable: @hozo\/old.*same version/s,
  )
})
