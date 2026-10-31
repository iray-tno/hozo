// Test-only filesystem/package-ownership callbacks around the REAL Metro
// resolver. The registry is fixture data, not production package discovery.
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

export function ownerMetroFixture(t) {
  const fromApp = createRequire(
    new URL('../../../examples/native-demo/package.json', import.meta.url),
  )
  const fromMetro = createRequire(fromApp.resolve('metro/package.json'))
  const { resolve } = fromMetro('metro-resolver')
  const version = fromMetro('metro-resolver/package.json').version
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-real-metro-owner-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const bridge = path.join(root, 'node_modules/bridge'),
    first = path.join(root, 'node_modules/kit')
  const second = path.join(bridge, 'node_modules/kit'),
    ordinary = path.join(root, 'node_modules/ordinary')
  const roots = [root, bridge, first, second, ordinary]
  const dependencies = [
    { kit: '1', bridge: '1', ordinary: '1' },
    { kit: '2' },
    {},
    { bridge: '1' },
    {},
  ]
  const packageData = (candidates) => ({
    schema: 'rfc010-package-shadow-0',
    owners: null,
    exports: [{ name: 'value', owners: [] }],
    helpers: [],
    candidates,
    compiledByConsumer: true,
    textForwarding: { version: 1, textForwarding: {} },
  })
  for (const [index, dir] of roots.entries()) {
    mkdirSync(dir, { recursive: true })
    const json = {
      name: index === 2 || index === 3 ? 'kit' : index === 0 ? 'app' : path.basename(dir),
      version: index === 3 ? '2.0.0' : '1.0.0',
      dependencies: dependencies[index],
      main: './index.js',
      exports: { '.': { android: './android.js', ios: './ios.js', default: './index.js' } },
      ...(index === 2 || index === 3 ? { hozo: { manifest: 'owner.json' } } : {}),
    }
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json))
    for (const file of ['index.js', 'android.js', 'ios.js', 'alternate.js'])
      writeFileSync(path.join(dir, file), 'throw new Error("resolver must not execute entries")')
    if (json.hozo)
      writeFileSync(
        path.join(dir, 'owner.json'),
        JSON.stringify(packageData([index === 2 ? 'p-4' : 'p-2'])),
      )
  }
  const lookup = (file) => {
    try {
      const stat = statSync(file)
      return { exists: true, type: stat.isFile() ? 'f' : 'd', realPath: realpathSync.native(file) }
    } catch {
      return { exists: false }
    }
  }
  const getPackage = (file) => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }
  const getPackageForModule = (file) => {
    const absolute = path.resolve(file)
    const rootPath = [...roots]
      .sort((a, b) => b.length - a.length)
      .find((candidate) => {
        const rel = path.relative(candidate, absolute)
        return (
          rel !== '..' &&
          !rel.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(rel) &&
          !rel.split(path.sep).includes('node_modules')
        )
      })
    return rootPath
      ? {
          rootPath,
          packageJson: getPackage(path.join(rootPath, 'package.json')),
          packageRelativePath: path.relative(rootPath, absolute),
        }
      : null
  }
  const context = {
    originModulePath: path.join(root, 'index.js'),
    getPackage,
    getPackageForModule,
    fileSystemLookup: lookup,
    doesFileExist: (file) => lookup(file).type === 'f',
    allowHaste: false,
    assetExts: new Set(),
    customResolverOptions: {},
    dev: true,
    disableHierarchicalLookup: false,
    extraNodeModules: {},
    mainFields: ['react-native', 'main'],
    nodeModulesPaths: [],
    preferNativePlatform: true,
    resolveAsset: () => null,
    redirectModulePath: (file) => file,
    resolveHasteModule: () => null,
    resolveHastePackage: () => null,
    sourceExts: ['js'],
    unstable_conditionNames: [],
    unstable_conditionsByPlatform: { android: ['android'], ios: ['ios'] },
    unstable_enablePackageExports: true,
    unstable_incrementalResolution: false,
    unstable_logWarning: (message) => {
      throw new Error(`unexpected resolver warning: ${message}`)
    },
    resolveRequest: resolve,
  }
  const delegate = (ctx, specifier, platform) => resolve(ctx, specifier, platform)
  return { root, bridge, first, second, roots, context, delegate, version }
}
