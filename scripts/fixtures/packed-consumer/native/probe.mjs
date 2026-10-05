import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import Metro from 'metro'
import { mapSources } from './map-sources.mjs'

const require = createRequire(import.meta.url)
const root = process.cwd()
const nativeRoot = path.dirname(require.resolve('@hozo/native/package.json'))
assert.ok(realpathSync(nativeRoot).startsWith(`${root}${path.sep}node_modules${path.sep}`))
const manifest = JSON.parse(readFileSync(path.join(nativeRoot, 'package.json'), 'utf8'))
assert.equal(manifest.codegenConfig.name, 'HozoNativeSpec')
mkdirSync('output', { recursive: true })
const config = await Metro.loadConfig({ cwd: root, resetCache: true })
// RN may include the project root itself. No watched path may rescue imports
// from the contributor's monorepo (or any other external workspace).
assert.ok(
  config.watchFolders.every((folder) => {
    const at = realpathSync(folder)
    return at === root || at.startsWith(`${root}${path.sep}`)
  }),
  JSON.stringify(config.watchFolders),
)
for (const platform of ['android', 'ios']) {
  const out = path.join(root, 'output', `${platform}.bundle`)
  await Metro.runBuild(config, {
    entry: 'index.js',
    platform,
    dev: false,
    minify: true,
    bundleOut: out,
    sourceMapOut: `${out}.map`,
    sourceMap: true,
  })
  assert.ok(readFileSync(out, 'utf8').length > 1000)
  const map = JSON.parse(readFileSync(`${out}.map`, 'utf8'))
  const sources = mapSources(map)
  assert.ok(sources.some((source) => source.includes('NativeHozoAccessibility')))
  assert.ok(sources.some((source) => source.includes('@hozo') && source.includes('button')))
  assert.ok(!sources.some((source) => source.includes('react-native-web')))
}
// Use RN's own discovery and generators on the installed tarball. This is
// autolink/codegen evidence, not a Gradle build or device-rendering claim.
const cli = require.resolve('@react-native-community/cli/build/bin.js')
const linked = JSON.parse(execFileSync(process.execPath, [cli, 'config'], { encoding: 'utf8' }))
const android = linked.dependencies['@hozo/native']?.platforms?.android
assert.ok(android?.sourceDir, JSON.stringify(android))
assert.ok(realpathSync(android.sourceDir).startsWith(`${realpathSync(nativeRoot)}${path.sep}`))
assert.equal(android.libraryName, 'HozoNativeSpec')
assert.equal(android.packageImportPath, 'import com.hozo.nativemodule.HozoNativePackage;')
assert.equal(android.packageInstance, 'new HozoNativePackage()')

// Keep RN's actual discovery record beside the generated spec.
writeFileSync(path.join(root, 'output', 'autolink.json'), `${JSON.stringify(linked, null, 2)}\n`)
const rnRoot = path.dirname(require.resolve('react-native/package.json'))
const schema = path.join(root, 'output', 'schema.json')
const codegenRoot = path.dirname(
  createRequire(path.join(rnRoot, 'package.json')).resolve('@react-native/codegen/package.json'),
)
execFileSync(
  process.execPath,
  [
    path.join(codegenRoot, 'lib/cli/combine/combine-js-to-schema-cli.js'),
    schema,
    path.join(nativeRoot, manifest.codegenConfig.jsSrcsDir),
    '--platform',
    'android',
  ],
  { stdio: 'inherit' },
)
assert.ok(Object.keys(JSON.parse(readFileSync(schema, 'utf8')).modules).length > 0)
execFileSync(
  process.execPath,
  [
    path.join(rnRoot, 'scripts/generate-specs-cli.js'),
    '--platform',
    'android',
    '--schemaPath',
    schema,
    '--outputDir',
    path.join(root, 'output', 'codegen'),
    '--libraryName',
    manifest.codegenConfig.name,
    '--javaPackageName',
    manifest.codegenConfig.android.javaPackageName,
  ],
  { stdio: 'inherit' },
)
assert.ok(existsSync(path.join(root, 'output', 'codegen')))
const generatedSpec = path.join(
  root,
  'output',
  'codegen',
  'java',
  'com',
  'hozo',
  'nativemodule',
  'NativeHozoAccessibilitySpec.java',
)
assert.match(readFileSync(generatedSpec, 'utf8'), /restoreAccessibilityFocus/)
assert.ok(existsSync(path.join(root, 'output', 'codegen', 'jni', 'HozoNativeSpec.h')))
console.log('packed Android/iOS production Metro bundles, Android autolink and codegen passed')
