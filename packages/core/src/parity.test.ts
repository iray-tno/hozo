// What every split Hozo package promises on one platform and not the other.
//
// Core's `index.tsx` and `index.native.ts` drifted first: `View`,
// `Pressable`, `Image`, `ScrollView`, `FlatList`, `List`, `ListItem` and
// `TextInput` were exported in a browser and absent on React Native.
// Metro bundled those named imports as `undefined`, so the failure waited
// for the first device render. Checking core alone then left every other
// package with the same two-entry contract unguarded.
//
// The package pairs are discovered from the filesystem. A parity test
// rather than a rendering one is enough: the difference is a fact about
// the two entry files, and reading them costs nothing. Renders would need
// React Native, which is exactly what a Node test process does not have.

import assert from 'node:assert/strict'
import { existsSync, globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Anchored at the workspace rather than at this file: the compiled test
// runs from '.test-build', where nothing it wants to read lives.
function workspaceRoot() {
  let at = path.dirname(fileURLToPath(import.meta.url))
  while (!existsSync(path.join(at, 'pnpm-workspace.yaml'))) {
    const up = path.dirname(at)
    if (up === at) throw new Error('no workspace root above this test')
    at = up
  }
  return at
}

const packages = path.join(workspaceRoot(), 'packages')
/**
 * Deliberate, with the reason each one is deliberate.
 *
 * Kept as a list rather than as a looser test, so adding to it is a
 * decision someone writes down.
 */
const WEB_ONLY = new Map([
  [
    '@hozo/core:Svg',
    'A separate entry point on React Native (`@hozo/runtime/svg`), because ' +
      '`export … from` in a barrel would load `react-native-svg` for every ' +
      'project, and it is an optional peer.',
  ],
  [
    '@hozo/canvas:renderCanvas2D',
    'The Canvas 2D renderer is a browser implementation detail; Native renders through Skia.',
  ],
])

function entryPairs() {
  return globSync(path.join(packages, '*', 'src', 'index.native.{ts,tsx}'))
    .map((native) => {
      const packageName = path.basename(path.dirname(path.dirname(native)))
      const web = ['index.ts', 'index.tsx']
        .map((name) => path.join(packages, packageName, 'src', name))
        .find(existsSync)
      return web ? { name: `@hozo/${packageName}`, web, native } : undefined
    })
    .filter((pair) => pair !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name))
}

const sourceFor = (specifier: string, native: boolean) => {
  const name = specifier.slice('@hozo/'.length)
  for (const file of native
    ? ['index.native.ts', 'index.native.tsx', 'index.ts', 'index.tsx']
    : ['index.ts', 'index.tsx']) {
    const candidate = path.join(packages, name, 'src', file)
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`no entry for ${specifier}`)
}

/** Every name a module publishes, following `export *` into this workspace. */
function exported(file: string, native: boolean, seen = new Set<string>()): Set<string> {
  const resolvedFile = path.resolve(file)
  if (seen.has(resolvedFile)) return new Set()
  seen.add(resolvedFile)
  const source = readFileSync(resolvedFile, 'utf8')
  const names = new Set<string>()
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of (match[1] as string).split(',')) {
      const name = part.trim().replace(/^type\s+/, '')
      if (name) names.add((name.split(/\s+as\s+/).pop() as string).trim())
    }
  }
  for (const match of source.matchAll(
    /export\s+(?:declare\s+)?(?:function|const|class|interface|type)\s+(\w+)/g,
  )) {
    names.add(match[1] as string)
  }
  for (const match of source.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1] as string
    const from = specifier.startsWith('@hozo/')
      ? sourceFor(specifier, native)
      : path.resolve(path.dirname(resolvedFile), specifier)
    for (const name of exported(from, native, seen)) names.add(name)
  }
  return names
}

test('every Web export in a split package also exists on React Native', () => {
  const missing: string[] = []
  for (const pair of entryPairs()) {
    const web = exported(pair.web, false)
    const nativeNames = exported(pair.native, true)
    for (const name of web) {
      const qualified = `${pair.name}:${name}`
      if (!nativeNames.has(name) && !WEB_ONLY.has(qualified)) missing.push(qualified)
    }
  }
  assert.deepEqual(
    missing,
    [],
    `absent from the native entry: ${missing.join(', ')}. Either export it there, or add it to WEB_ONLY with the reason.`,
  )
})

test('the deliberate exceptions are still exceptions', () => {
  // A name listed as Web-only that has since gained a native export is a
  // stale comment, and the next person reads it as a rule.
  const pairs = new Map(entryPairs().map((pair) => [pair.name, pair]))
  for (const [qualified, why] of WEB_ONLY) {
    const separator = qualified.indexOf(':')
    const packageName = qualified.slice(0, separator)
    const name = qualified.slice(separator + 1)
    const pair = pairs.get(packageName)
    assert.ok(pair, `${qualified} names a package without split entries: ${why}`)
    assert.ok(
      exported(pair.web, false).has(name),
      `${qualified} is listed as Web-only and is not exported there: ${why}`,
    )
  }
})

test('a native source renders components rather than the names of components', () => {
  // These files used to call `React.createElement('View')`. React Native
  // resolves a string tag through its view config registry, where the
  // registered names are `RCTView` and `RCTText` -- so every one of them
  // threw on the first render. The Web tests beside them render the DOM
  // half and saw nothing.
  const offenders: string[] = []
  for (const file of nativeSources()) {
    const source = code(readFileSync(file, 'utf8'))
    for (const match of source.matchAll(/createElement\(\s*'([A-Z]\w*)'/g)) {
      offenders.push(`${path.relative(packages, file)}: '${match[1]}'`)
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

test('a native source imports React Native rather than reaching for globalThis', () => {
  // `(globalThis as Record<string, unknown>).Linking` was three of these.
  // React Native puts none of its modules on the global object, so each
  // lookup returned `undefined`, the guard around it failed, and the
  // feature was silently absent -- a link that did not open, a back
  // button that did not dismiss, an announcement never made.
  const offenders: string[] = []
  for (const file of nativeSources()) {
    const source = code(readFileSync(file, 'utf8'))
    for (const match of source.matchAll(/globalThis[^\n]*\)\.(\w+)/g)) {
      const name = match[1] as string
      if (/^[A-Z]/.test(name)) offenders.push(`${path.relative(packages, file)}: ${name}`)
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

/** The source with its comments removed, since these rules are about code. */
function code(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Every `.native` source in the workspace, which is what these rules are about. */
function nativeSources() {
  return globSync(path.join(packages, '*', 'src', '**', '*.native.{ts,tsx}')).filter(
    (file: string) => !file.includes('.test.'),
  )
}
