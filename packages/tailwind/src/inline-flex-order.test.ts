import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `inline-flex` had no ownership entry, so an input with one kept its
// authored order: `md:hidden inline-flex` showed the item at `md`, and
// `inline-flex flex` let `flex` win where Tailwind's tiebreak puts
// `inline-flex` last.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:hidden', 'inline-flex'],
  ['md:inline-flex', 'hidden'],
  ['inline-flex', 'flex'],
  ['inline-flex', 'hidden'],
  ['inline-flex', 'block'],
  ['inline-flex', 'self-center'],
  ['md:self-center', 'inline-flex'],
]
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="flex-row ${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('inline-flex settles in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set([...pairs.flat(), 'flex-row'])])
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, [], pair.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, pair.join(' '))
    const native = [pair, pair.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, [], pair.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, pair.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, pair.join(' '))
  }
})

test('static Native and the dynamic map settle on the same display', async () => {
  const names = ['inline-flex', 'flex', 'hidden', 'self-center', 'flex-row']
  const final = await context(names)
  const compiler = createCompiler()
  const cache = openCandidateCache()
  cache.scanFile('inline.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const dynamic = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  for (const classes of [
    'flex-row inline-flex',
    'flex-row inline-flex flex',
    'flex-row flex inline-flex',
    'flex-row inline-flex self-center',
    'flex-row self-center inline-flex',
    'flex-row inline-flex hidden',
    'flex-row hidden inline-flex',
  ]) {
    const styles = compiler
      .prepareNativeModule(source(classes.replace('flex-row ', '')))
      .emit(final).components[0]!.styles
    const value = (key: string) => styles.match(new RegExp(`${key}: '([^']+)'`))?.[1]
    const actual = dynamic(classes)
    assert.equal(actual.display, value('display'), `${classes} display:\n${styles}`)
    // Only the static path synthesizes `alignSelf: 'flex-start'`; the generated map
    // never has. That gap predates ordering and is pinned here, not hidden.
    if (actual.alignSelf !== value('alignSelf')) {
      assert.equal(
        actual.alignSelf,
        classes.includes('self-center') ? 'center' : undefined,
        classes,
      )
      assert.equal(value('alignSelf'), 'flex-start', classes)
    }
  }
})
