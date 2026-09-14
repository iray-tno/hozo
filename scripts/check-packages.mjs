// Looks inside the tarballs npm would upload, rather than at the
// `package.json` that describes them.
//
// The failure this exists for: publishing with `dist/` unbuilt. Every
// field is correct, `npm publish` succeeds, the package installs cleanly,
// and the first `import` fails for everyone. npm has no undo past 72
// hours and none at all once something depends on it, so the check has to
// happen before the upload rather than after the bug report.
//
// `npm pack --dry-run --json` is the authority here: it applies `files`,
// the implicit includes (`package.json`, `README`, `LICENSE`) and the
// implicit excludes, and reports exactly what would go up.
//
//   node scripts/check-packages.mjs

import { execSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { build } from 'esbuild'

import { facadedOwners, generatedLeaves } from './generated-abi.mjs'
import { applyMetadata, PACKAGE_NAMES, VERSION } from './package-metadata.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const packedPackages = []

function fail(pkg, message) {
  problems.push(`@hozo/${pkg}: ${message}`)
}

/** The paths `npm pack` would put in the tarball, relative and slash-separated. */
function packedPackage(dir) {
  // `execSync` with one command string rather than `execFileSync` with an
  // argument array. Node 25 refuses to spawn a `.cmd` without a shell, so
  // Windows needs one either way, and passing an array alongside `shell:
  // true` earns a deprecation warning -- the shell concatenates arguments
  // instead of escaping them. There is nothing to escape here.
  const output = execSync('npm pack --dry-run --json', {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const packed = JSON.parse(output)[0]
  return {
    files: new Set(packed.files.map((file) => file.path.replaceAll('\\', '/'))),
    tarballBytes: packed.size,
    unpackedBytes: packed.unpackedSize,
  }
}

/** Every file path an `exports` map points at, at any depth. */
function exportTargets(node, found = []) {
  if (typeof node === 'string') {
    if (node.startsWith('./')) found.push(node.slice(2))
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) exportTargets(value, found)
  }
  return found
}

for (const name of PACKAGE_NAMES) {
  const dir = path.join(root, 'packages', name)
  const json = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const packed = packedPackage(dir)
  const files = packed.files
  packedPackages.push({ name, ...packed, fileCount: files.size })

  // The metadata is generated; a hand edit that drifts from the generator
  // is a difference nobody chose.
  const { text } = applyMetadata(name)
  if (readFileSync(path.join(dir, 'package.json'), 'utf8') !== text) {
    fail(name, 'package.json differs from scripts/package-metadata.mjs -- rerun it')
  }

  // A scoped package defaults to a paid private publish. Without this,
  // `npm publish` stops with 402 Payment Required.
  if (json.publishConfig?.access !== 'public') fail(name, 'publishConfig.access is not "public"')
  if (json.private) fail(name, 'still marked private')
  if (json.version !== VERSION) fail(name, `version is ${json.version}, expected ${VERSION}`)

  // Tree shaking is part of the package contract. Native ambient hooks are
  // the sole exception: importing that module installs the shared platform
  // subscriptions even when no binding from it survives locally.
  const expectedSideEffects = name === 'runtime' ? ['./dist/hooks.native.js'] : false
  if (JSON.stringify(json.sideEffects) !== JSON.stringify(expectedSideEffects)) {
    fail(
      name,
      `sideEffects is ${JSON.stringify(json.sideEffects)}, expected ${JSON.stringify(expectedSideEffects)}`,
    )
  }
  for (const sideEffect of Array.isArray(json.sideEffects) ? json.sideEffects : []) {
    const relative = sideEffect.replace(/^\.\//, '')
    if (!files.has(relative)) fail(name, `${relative} is marked as a side effect but is not packed`)
  }

  // Every entry point has to be in the tarball, which is the whole point.
  for (const target of [json.main, json.types, ...exportTargets(json.exports)]) {
    if (!target) continue
    const relative = target.replace(/^\.\//, '')
    if (!files.has(relative)) fail(name, `${relative} is named as an entry point but is not packed`)
  }

  // A published package with no README is a blank page on npm.
  if (!files.has('README.md')) fail(name, 'no README.md in the tarball')
  if (!files.has('LICENSE')) fail(name, 'no LICENSE in the tarball')

  // Things that must never ship.
  for (const file of files) {
    if (/\.test\.tsx?$/.test(file)) fail(name, `${file} is a test and should not ship`)
    if (file.endsWith('.node')) {
      fail(name, `${file} is a platform-specific addon; it belongs in its own package`)
    }
    if (file.startsWith('tsconfig')) fail(name, `${file} should not ship`)
  }

  // A package with .native sources that Metro can never reach.
  //
  // `@hozo/semantics` shipped exactly that: an `index.native.tsx` built
  // into `dist` and an `exports` map with no `react-native` condition, so
  // every native project resolved the DOM build and rendered <div>. The
  // file was there, the build was there, and nothing pointed at it.
  const native = globSync(path.join(dir, 'src', '**', '*.native.{ts,tsx}')).filter(
    (file) => !file.includes('.test.'),
  )
  if (native.length > 0) {
    const condition = json.exports?.['.']?.['react-native']
    if (!condition) {
      fail(name, `has ${native.length} .native source(s) and no "react-native" export condition`)
    }
    if (!json.peerDependencies?.['react-native']) {
      fail(name, 'has .native sources and does not declare react-native as a peer')
    }
  }

  // The same failure one level in: a `react-native` condition that Metro
  // reaches and TypeScript cannot.
  //
  // The condition was a bare string, and `types` was listed ahead of it.
  // A resolver takes the first matching condition, and every React Native
  // project sets `customConditions: ["react-native"]` -- `expo/
  // tsconfig.base` and `@react-native/typescript-config` both do -- so
  // `tsc` asked for the native entry point, matched `types` first, and was
  // handed the Web declarations. Silently: Metro reads this map with its
  // own conditions and never looks at `types`, so the app kept working
  // while every native prop type went unchecked.
  for (const [subpath, entry] of Object.entries(json.exports ?? {})) {
    const condition = entry?.['react-native']
    if (!condition) continue
    if (typeof condition === 'string') {
      fail(name, `exports["${subpath}"]["react-native"] has no "types" of its own`)
      continue
    }
    if (!condition.types?.endsWith('.native.d.ts')) {
      fail(name, `exports["${subpath}"]["react-native"].types is not a .native.d.ts`)
    }
    const order = Object.keys(entry)
    if (order.indexOf('react-native') > order.indexOf('types')) {
      fail(name, `exports["${subpath}"] lists "types" before "react-native"; the first match wins`)
    }
  }
  // `workspace:*` publishes as an exact pin, which gives a project holding
  // two Hozo packages one patch apart two copies of the compiler -- and so
  // two native addons and two candidate caches. `workspace:^` dedupes.
  for (const field of ['dependencies', 'peerDependencies']) {
    for (const [dep, range] of Object.entries(json[field] ?? {})) {
      if (range.startsWith('workspace:') && range !== 'workspace:^') {
        fail(name, `${field}.${dep} is "${range}"; use "workspace:^"`)
      }
    }
  }
  if (
    name !== 'svg' &&
    ['dependencies', 'optionalDependencies', 'peerDependencies'].some(
      (field) => json[field]?.['react-native-svg'],
    )
  ) {
    fail(name, 'declares react-native-svg outside its optional @hozo/svg owner')
  }

  // Depending on something unpublishable produces a package that cannot
  // be installed from the registry at all.
  for (const dep of Object.keys(json.dependencies ?? {})) {
    if (!dep.startsWith('@hozo/')) continue
    const depName = dep.slice('@hozo/'.length)
    if (!PACKAGE_NAMES.includes(depName)) {
      fail(name, `depends on ${dep}, which is not published`)
    }
  }
}

// Metadata can look correct and still fail to shake at the package boundary.
// These are real consumer-shaped Web bundles: React remains a peer and is
// deliberately excluded from the measured bytes. Every canonical owner is
// measured directly and through the zero-setup core facade. The comparison
// catches a facade star export retaining a sibling package even when both
// absolute bundles remain under a generous ceiling.
async function bundleExport(packageName, exportName) {
  const result = await build({
    stdin: {
      contents: `export { ${exportName} } from './packages/${packageName}/dist/index.js'`,
      resolveDir: root,
      sourcefile: `${packageName}-${exportName}-tree-shaking-probe.mjs`,
    },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    external: ['react', 'react-dom', 'react-native'],
    logLevel: 'silent',
  })
  const contents = result.outputFiles[0].contents
  return { raw: contents.byteLength, gzip: gzipSync(contents, { level: 9 }).length }
}

const treeShakingProbes = [
  { owner: 'primitives', name: 'Text', maxRaw: 6_000 },
  { owner: 'primitives', name: 'Link', maxRaw: 3_000 },
  { owner: 'primitives', name: 'Button', maxRaw: 2_500 },
  // Windowing is real functionality rather than accidental barrel weight.
  { owner: 'primitives', name: 'FlatList', maxRaw: 24_000 },
  { owner: 'patterns', name: 'Dialog', maxRaw: 2_000 },
  { owner: 'patterns', name: 'Tree', maxRaw: 5_000 },
  { owner: 'typography', name: 'Heading', maxRaw: 1_500 },
  { owner: 'semantics', name: 'Main', maxRaw: 1_500 },
  // SVG is intentionally absent from core: importing the facade must not
  // make a Native app install react-native-svg.
  { owner: 'svg', name: 'Svg', maxRaw: 5_000, facade: false },
]
const bundleSizes = []

for (const probe of treeShakingProbes) {
  try {
    const direct = await bundleExport(probe.owner, probe.name)
    const facade = probe.facade === false ? undefined : await bundleExport('core', probe.name)
    bundleSizes.push({ ...probe, direct, facade })
    if (direct.raw > probe.maxRaw) {
      fail(
        probe.owner,
        `a bundled ${probe.name} export is ${direct.raw} bytes, above the ${probe.maxRaw}-byte tree-shaking limit`,
      )
    }
    // A facade re-export needs at most a few binding bytes. Anything larger
    // means an unrelated owner survived tree shaking.
    if (facade && (facade.raw > direct.raw + 128 || facade.gzip > direct.gzip + 64)) {
      fail(
        'core',
        `${probe.name} adds too much facade weight: direct ${direct.raw}/${direct.gzip} bytes raw/gzip, core ${facade.raw}/${facade.gzip}`,
      )
    }
  } catch (error) {
    fail(
      probe.owner,
      `${probe.name} tree-shaking probe could not bundle: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

// The generated-code ABI is derived, and a derived file that nobody
// regenerated is the same drift as a hand-edited `package.json`.
try {
  execSync(`node "${path.join(root, 'scripts', 'generated-abi.mjs')}" --check`, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  fail('core', `generated ABI is out of date: ${error.stderr?.toString().trim() || error.message}`)
}

// A `@hozo/core/generated/*` leaf is a one-line forward, and has to cost
// what the owner's leaf costs. It is the module compiled output imports, so
// weight here lands in every application -- and on Native, where nothing
// tree-shakes, all of it does. Native-only leaves bundle as well as any:
// React Native stays external, and what is measured is Hozo's own code.
async function bundleModule(file) {
  const result = await build({
    stdin: {
      contents: `export * from './${path.relative(root, file).replaceAll('\\', '/')}'`,
      resolveDir: root,
      sourcefile: 'generated-leaf-probe.mjs',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    external: ['react', 'react-dom', 'react-native', 'react-native-*', 'expo-*', '@shopify/*'],
    logLevel: 'silent',
  })
  const contents = result.outputFiles[0].contents
  return { raw: contents.byteLength, gzip: gzipSync(contents, { level: 9 }).length }
}

const facaded = facadedOwners()
let leafProbes = 0
for (const { owner, leaf } of generatedLeaves()) {
  if (!facaded.has(owner)) continue
  try {
    const direct = await bundleModule(
      path.join(root, 'packages', owner, 'dist', 'generated', `${leaf}.js`),
    )
    const facade = await bundleModule(
      path.join(root, 'packages', 'core', 'dist', 'generated', `${leaf}.js`),
    )
    leafProbes += 1
    if (facade.raw > direct.raw + 128 || facade.gzip > direct.gzip + 64) {
      fail(
        'core',
        `generated/${leaf} adds facade weight: @hozo/${owner} ${direct.raw}/${direct.gzip} bytes raw/gzip, core ${facade.raw}/${facade.gzip}`,
      )
    }
  } catch (error) {
    fail(
      'core',
      `generated/${leaf} probe could not bundle: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

console.log('npm package sizes (tarball / unpacked / files)')
for (const packed of packedPackages) {
  console.log(
    `  @hozo/${packed.name}: ${packed.tarballBytes} / ${packed.unpackedBytes} bytes / ${packed.fileCount}`,
  )
}

console.log('Web tree-shaking sizes (direct owner -> @hozo/core when facaded, raw / gzip)')
for (const probe of bundleSizes) {
  const facade = probe.facade ? ` -> ${probe.facade.raw}/${probe.facade.gzip}` : ' (domain-only)'
  console.log(`  ${probe.name}: ${probe.direct.raw}/${probe.direct.gzip}${facade} bytes`)
}

console.log(`${leafProbes} @hozo/core/generated leaves cost what their owners' leaves cost`)

if (problems.length > 0) {
  console.error(`${problems.length} problem(s) would reach the registry:\n`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`${PACKAGE_NAMES.length} packages pack correctly`)
