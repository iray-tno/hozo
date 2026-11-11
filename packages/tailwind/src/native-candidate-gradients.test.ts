import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { transformSync } from 'esbuild'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoGradientStyles } from '../../engine/src/gradient-slots.ts'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')}\n@tailwind utilities;`

test('metadata-only gradient writes acquire real conflict ranks without fictitious Native keys', async () => {
  // No padding or other unrelated style conflict may accidentally enable ranks.
  const names = [
    'bg-linear-to-r',
    'from-red-500',
    'from-blue-500',
    'to-green-500',
    'from-25%',
    'from-75%',
  ]
  const prepared = await prepareTailwindOrder(css, base, names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(context, theme)
  const entries = new Map(plan.entries.map((entry) => [entry.candidate, entry]))
  for (const name of names.slice(1)) {
    const group = entries.get(name)!.groups[0]!
    assert.equal(entries.get(name)!.kind, 'style')
    assert.deepEqual(group.nativeKeys, [])
    assert.ok(group.compositionKeys.length > 0)
    assert.ok(group.orderable)
    assert.ok(plan.ordering?.ranks[name])
  }
  assert.deepEqual(
    entries.get('from-red-500')!.groups[0]!.compositionKeys,
    entries.get('from-blue-500')!.groups[0]!.compositionKeys,
  )
  assert.notDeepEqual(
    entries.get('from-red-500')!.groups[0]!.compositionKeys,
    entries.get('from-25%')!.groups[0]!.compositionKeys,
  )
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
    { createClassResolver, hozoGradientStyles },
  )
  for (const order of [names, names.toReversed()]) {
    const result = compiler
      .prepareNativeModule(
        `import {View} from '@hozo/core';export const C=()=> <View className="${order.join(' ')}"/>`,
      )
      .emit(context).components[0]!
    assert.deepEqual(result.diagnostics, [])
    const expected = Object.assign(
      {},
      ...Object.values(new Function(`return (${result.styles})`)()),
    ).backgroundImage
    assert.equal(Object.assign({}, ...resolve(order.join(' '))).backgroundImage, expected)
  }
})

test('actual Tailwind priorities make conditional static and runtime gradient registers agree', async () => {
  const names = [
    'bg-linear-to-r',
    'from-red-500',
    'to-blue-500',
    'hover:bg-radial',
    'focus:from-green-500',
    'hover:focus:from-25%',
    'active:via-none',
    'via-yellow-500',
  ]
  const prepared = await prepareTailwindOrder(css, base, names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(context, theme)
  assert.ok(plan.entries.every((entry) => entry.groups.every((group) => group.orderable)))
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
    { createClassResolver, hozoGradientStyles },
  )
  for (const order of [names, names.toReversed()]) {
    const result = compiler
      .prepareNativeModule(
        `import {Pressable} from '@hozo/core';export const C=()=> <Pressable className="${order.join(' ')}"/>`,
      )
      .emit(context).components[0]!
    assert.deepEqual(result.diagnostics, [])
    const props = runInNewContext(
      transformSync(`const hozoStyles=${result.styles};(${result.jsx})`, {
        loader: 'tsx',
        jsxFactory: 'h',
      }).code,
      {
        hozoGradientStyles,
        Pressable: 'owner',
        HozoPressable: 'owner',
        h: (_type: unknown, props: Record<string, unknown>) => props,
      },
    )
    for (const hovered of [false, true])
      for (const focused of [false, true])
        for (const pressed of [false, true]) {
          const state = { hovered, focused, pressed }
          const expected = Object.assign({}, ...props.style(state).flat(Infinity)).backgroundImage
          assert.equal(
            Object.assign({}, ...resolve(order.join(' '), state)).backgroundImage,
            expected,
            `${order.join(' ')}/${JSON.stringify(state)}`,
          )
        }
  }
})
