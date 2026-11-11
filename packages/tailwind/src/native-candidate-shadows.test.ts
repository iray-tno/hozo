import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { transformSync } from 'esbuild'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoShadowStyles } from '../../engine/src/shadow-slots.ts'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

test('metadata-only colour conflicts activate compact ranks without another Native style conflict', async () => {
  const base = tailwindPackageDir()
  const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')}\n@tailwind utilities;`
  const names = ['shadow-sm', 'shadow-red-500', 'shadow-blue-500']
  const prepared = await prepareTailwindOrder(css, base, names)
  const theme = await loadTheme(css, base)
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(
    prepareFinalTailwindContext(JSON.stringify(prepared.snapshot)),
    theme,
  )
  assert.equal(
    plan.entries.filter((entry) => entry.groups[0]?.nativeKeys.includes('boxShadow')).length,
    1,
  )
  assert.ok(plan.ordering?.ranks['shadow-red-500'])
  assert.ok(plan.ordering?.ranks['shadow-blue-500'])
})

test('actual Tailwind priorities compose shadow registers identically in static and runtime Native', async () => {
  const base = tailwindPackageDir()
  const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')}\n@tailwind utilities;`
  const names = [
    'shadow-sm',
    'shadow-blue-500',
    'shadow-red-500',
    'hover:shadow-green-500',
    'focus:ring-2',
    'focus:ring-offset-2',
    'focus:ring-red-500',
    'active:shadow-none',
  ]
  const prepared = await prepareTailwindOrder(css, base, names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(context, theme)
  const colors = plan.entries.filter((entry) =>
    ['shadow-blue-500', 'shadow-red-500'].includes(entry.candidate),
  )
  assert.equal(colors.length, 2)
  for (const entry of colors) {
    assert.deepEqual(entry.groups[0]!.nativeKeys, [])
    assert.deepEqual(entry.groups[0]!.compositionKeys, ['shadow:outerColor'])
    assert.ok(plan.ordering?.ranks[entry.candidate])
  }
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
    { createClassResolver, hozoShadowStyles },
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
        hozoShadowStyles,
        Pressable: 'owner',
        HozoPressable: 'owner',
        h: (_type: unknown, props: Record<string, unknown>) => props,
      },
    )
    for (const hovered of [false, true])
      for (const focused of [false, true])
        for (const pressed of [false, true]) {
          const state = { hovered, focused, pressed }
          assert.equal(
            Object.assign({}, ...resolve(order.join(' '), state)).boxShadow,
            Object.assign({}, ...props.style(state).flat(Infinity)).boxShadow,
            JSON.stringify({ order, state }),
          )
        }
  }
})
