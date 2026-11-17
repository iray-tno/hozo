import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  createCompiler,
  openCandidateCache,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
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
  'flex hidden',
  'absolute relative',
  'overflow-hidden overflow-visible',
  'basis-8 basis-4',
  'flex-wrap flex-nowrap',
  'backface-hidden backface-visible',
  'box-border box-content',
  'isolate isolation-auto',
  'pointer-events-none pointer-events-auto',
  'static relative',
  'select-none select-text',
  'align-top align-middle',
  'underline no-underline',
  'decoration-solid decoration-dashed',
  'decoration-[#ff0000] decoration-[#0000ff]',
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
  const legacy = prepareAuthoredTailwindContext(JSON.stringify(prepared.snapshot))
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

/** Output with the order-as-written warning set aside, and how many it held. */
function apartFromOrderWarning<T>(output: T): { output: T; warnings: number } {
  let warnings = 0
  const output_ = JSON.parse(JSON.stringify(output), (key, value) => {
    if (key !== 'diagnostics' || !Array.isArray(value)) return value
    const kept = value.filter((d: { code?: string }) => d.code !== 'TAILWIND_ORDER_AS_WRITTEN')
    warnings += value.length - kept.length
    return kept
  })
  return { output: output_, warnings }
}

test('unassessed text, layout and paint writes still prevent ranks from crossing them', async () => {
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  for (const neighbor of [
    'tracking-[1em]',
    'leading-[1em]',
    'columns-(--layout)',
    'cursor-[grab]',
    'overline',
    'align-baseline',
    'bg-[url(x.png)]',
  ]) {
    const classes = `p-4 ${neighbor} p-2`
    const names = classes.split(' ')
    const prepared = await prepareTailwindOrder(css, base, names)
    const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
    const legacy = prepareAuthoredTailwindContext(JSON.stringify(prepared.snapshot))
    // The barrier keeps written order, so output equals the authored route's;
    // the ranked route also says that order decided between p-4 and p-2.
    for (const [ranked, authored] of [
      [
        compiler.prepareWebModule(source(classes)).emit(final),
        compiler.prepareWebModule(source(classes)).emit(legacy),
      ],
      [
        compiler.prepareNativeModule(source(classes)).emit(final),
        compiler.prepareNativeModule(source(classes)).emit(legacy),
      ],
    ] as const) {
      const apart = apartFromOrderWarning(ranked)
      assert.deepEqual(apart.output, apartFromOrderWarning(authored).output)
      assert.equal(apart.warnings, 1, neighbor)
    }
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
