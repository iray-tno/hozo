/**
 * No module React Native can load writes an HTML element (decision 010).
 *
 * Hozo compiles its primitives, not intrinsic tags: a `<div>` reaches React
 * Native unchanged, and React Native has no `div` to render. `@hozo/ui` had
 * nine of them, unnoticed, because everything that looked at it looked at it
 * in a browser (#983, #984). This reads every package's source, with comments
 * taken out, since a doc comment explaining why a `<div>` is not used is
 * exactly where the word belongs.
 *
 * A module Native never loads is the Web half of a component and should write
 * the DOM: a `.tsx` with a `.native.tsx` beside it, or a `.web.tsx`. Anything
 * else Native reaches some other way is listed below with the reason, and the
 * list fails when an entry no longer needs to be there.
 */

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const root = path.join(import.meta.dirname, '..')

/** Web-only modules that have no `.native` sibling, and why Native never loads them. */
const WEB_ONLY = {
  'packages/three/src/r3f.tsx':
    'the `./r3f` export has a `react-native` condition that points at r3f-react-native.tsx',
  'packages/three/src/web-surface.tsx':
    'imported only by the WebGL and WebGPU renderers, whose exports have `react-native` conditions of their own',
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'tests', 'test', 'fixtures'])

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sources(full)
    return /\.(tsx|jsx)$/.test(entry.name) && !/\.(test|stories|bench)\./.test(entry.name)
      ? [full]
      : []
  })
}

/** The Web half of a split component, which is meant to write the DOM. */
function isWebHalf(file) {
  if (/\.(web|dom)\.(tsx|jsx)$/.test(file)) return true
  const base = file.replace(/\.(tsx|jsx)$/, '')
  return ['.native.tsx', '.native.ts', '.native.jsx'].some((suffix) => existsSync(base + suffix))
}

export function intrinsicTags(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, '$1')
  // Not after an identifier: `Map<string, …>` and `useState<number>` are type
  // arguments, not elements.
  return [...code.matchAll(/(?<![\w$.\]])<([a-z][\w-]*)[\s/>]/g)].map((match) => match[1])
}

test('type arguments are not read as elements', () => {
  assert.deepEqual(intrinsicTags('const m = new Map<string, number>()'), [])
  assert.deepEqual(intrinsicTags('const [a] = useState<boolean>(false)'), [])
  assert.deepEqual(intrinsicTags('return <div className="x" />'), ['div'])
  assert.deepEqual(intrinsicTags('cond ? <span>a</span> : null'), ['span'])
  assert.deepEqual(intrinsicTags('// a <div> here is the explanation\n'), [])
})

test('no module React Native can load writes an HTML element', () => {
  const files = readdirSync(path.join(root, 'packages')).flatMap((name) => {
    const src = path.join(root, 'packages', name, 'src')
    return existsSync(src) ? sources(src) : []
  })
  assert.ok(files.length > 100, `only ${files.length} source files were read`)
  const offenders = []
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    if (isWebHalf(file) || relative in WEB_ONLY) continue
    const tags = intrinsicTags(readFileSync(file, 'utf8'))
    if (tags.length > 0) offenders.push(`${relative} writes <${tags[0]}>`)
  }
  assert.deepEqual(
    offenders,
    [],
    'use View or Text from @hozo/core, or split the module into .tsx and .native.tsx (docs/decisions/010)',
  )
})

test('every Web-only exemption still writes the DOM, so none outlives its reason', () => {
  for (const file of Object.keys(WEB_ONLY)) {
    assert.ok(existsSync(path.join(root, file)), `${file} is gone; remove it from WEB_ONLY`)
    assert.ok(
      intrinsicTags(readFileSync(path.join(root, file), 'utf8')).length > 0,
      `${file} no longer writes an HTML element; remove it from WEB_ONLY`,
    )
  }
})
