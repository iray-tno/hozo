import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  createCompiler,
  openCandidateCache,
  prepareFinalTailwindContext,
  prepareTailwindContext,
  TAILWIND_SCALAR_ORDER_POLICY,
} from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')}\n@tailwind utilities;`
const pairs = [
  'opacity-75 opacity-50',
  'z-20 z-10',
  'flex-row flex-col',
  'grow grow-0',
  'shrink shrink-0',
  'items-center items-start',
  'self-center self-start',
  'content-center content-end',
  'justify-center justify-end',
  'text-left text-right',
  'uppercase lowercase',
  'italic not-italic',
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`
function resolveGenerated(code: string) {
  return runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}\nhozoClasses`,
    { createClassResolver },
  )
}

test('simple projections acquire actual ownership and common static/fallback winners instead of freezing unrelated scalar inputs', async () => {
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  const names = [...new Set([...pairs.flatMap((pair) => pair.split(' ')), 'p-2', 'p-4'])]
  const prepared = await prepareTailwindOrder(css, base, names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  assert.equal(final.fingerprint.split(':')[0], TAILWIND_SCALAR_ORDER_POLICY)
  const legacy = prepareTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final, theme)
  assert.ok(plan.ordering)
  for (const name of names) {
    const entry = plan.entries.find((entry) => entry.candidate === name)!
    assert.ok(entry.groups.length > 0, name)
    assert.ok(
      entry.groups.every((group) => group.orderable),
      name,
    )
  }
  const resolve = resolveGenerated(plan.code)
  for (const pair of pairs) {
    let wrongLegacy = 0
    let previous: string | undefined
    for (const classes of [`p-4 p-2 ${pair}`, `${pair.split(' ').reverse().join(' ')} p-2 p-4`]) {
      const input = source(classes)
      const web = compiler.prepareWebModule(input).emit(final)[0]!
      const old = compiler.prepareWebModule(input).emit(legacy)[0]!
      assert.match(web.css, /padding-top: 16px/)
      wrongLegacy += Number(web.css !== old.css)
      if (previous) assert.equal(web.css, previous, pair)
      previous = web.css
      const native = compiler.prepareNativeModule(input).emit(final).components[0]!
      const styles = runInNewContext(`(${native.styles})`)
      const actual = Object.assign({}, ...Object.values(styles))
      const dynamic = Object.assign({}, ...resolve(classes))
      assert.deepEqual(
        JSON.parse(JSON.stringify(actual)),
        JSON.parse(JSON.stringify(dynamic)),
        pair,
      )
    }
    assert.ok(wrongLegacy > 0, `negative control for ${pair}`)
  }
})

test('font registers, gap aliases and transform neighbors still preserve their whole old input rather than receive guessed scalar priorities', async () => {
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  for (const neighbor of ['font-bold', 'text-lg', 'gap-2', 'rotate-45']) {
    const classes = `p-4 p-2 ${neighbor}`
    const names = classes.split(' ')
    const prepared = await prepareTailwindOrder(css, base, names)
    const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
    const legacy = prepareTailwindContext(JSON.stringify(prepared.snapshot))
    assert.deepEqual(
      compiler.prepareWebModule(source(classes)).emit(final),
      compiler.prepareWebModule(source(classes)).emit(legacy),
    )
    assert.deepEqual(
      compiler.prepareNativeModule(source(classes)).emit(final),
      compiler.prepareNativeModule(source(classes)).emit(legacy),
    )
    const cache = openCandidateCache()
    cache.scanFile('runtime.ts', JSON.stringify(classes), 0)
    const entry = cache
      .renderNativeModulePlan(final, theme)
      .entries.find((entry) => entry.candidate === neighbor)!
    assert.ok(
      entry.groups.every((group) => !group.orderable),
      neighbor,
    )
  }
})
