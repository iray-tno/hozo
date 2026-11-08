import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Logical edges and insets were left out of the ordering domain,
// so an input with one kept its authored order: `md:px-4 px-2` kept `px-2` at
// every width, and `ps-2 px-4` let `px-4` overwrite the start edge.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:px-4', 'px-2'],
  ['md:ps-4', 'ps-2'],
  ['md:mx-4', 'mx-2'],
  ['md:mx-auto', 'mx-2'],
  ['md:-mx-4', 'mx-2'],
  ['md:inset-4', 'inset-2'],
  ['md:inset-x-4', 'inset-x-2'],
  ['md:start-4', 'start-2'],
  ['hover:px-4', 'px-2'],
  ['ps-2', 'px-4'],
  ['px-2', 'p-4'],
  ['me-2', 'mx-4'],
  ['mx-auto', 'm-4'],
  ['start-2', 'inset-x-4'],
  ['top-2', 'inset-4'],
  ['inset-y-2', 'inset-4'],
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('logical edges and insets settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(pairs.flat())])
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, [], pair.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, pair.join(' '))
    const native = [pair, pair.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, pair.join(' '))
    if (native[0]!.diagnostics.length === 0) {
      assert.equal(native[0]!.styles, native[1]!.styles, pair.join(' '))
      assert.equal(native[0]!.jsx, native[1]!.jsx, pair.join(' '))
    }
  }
})

test('Native writes to the same logical key in Tailwind order', async () => {
  const compiler = createCompiler()
  const final = await context(['ps-2', 'px-4'])
  for (const classes of ['ps-2 px-4', 'px-4 ps-2']) {
    const native = compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
    assert.deepEqual(native.diagnostics, [], classes)
    // Tailwind emits `padding-inline` before `padding-inline-start`, so the
    // start edge is `ps-2`'s in either order.
    const starts = [...native.styles.matchAll(/paddingStart: (\d+)/g)].map((match) => match[1])
    assert.equal(starts.at(-1), '8', `${classes}:\n${native.styles}`)
  }
})

test('the dynamic Native map ranks the same logical writes', async () => {
  const names = ['ps-2', 'px-4', 'me-2', 'mx-4']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('logical.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key logical conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  for (const classes of ['ps-2 px-4', 'px-4 ps-2']) {
    assert.equal(style(classes).paddingStart, 8, classes)
    assert.equal(style(classes).paddingEnd, 16, classes)
  }
  for (const classes of ['me-2 mx-4', 'mx-4 me-2']) {
    assert.equal(style(classes).marginStart, 16, classes)
    assert.equal(style(classes).marginEnd, 8, classes)
  }
})
