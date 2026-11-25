import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  openCandidateCache,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { compile } from 'tailwindcss'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 3 of the inventory (docs/measurements/tailwind-order-inventory.md):
// `outline-none` and `outline-hidden` are written styles, and
// `outline-hidden`'s forced-colors branch is not a second place in the
// order, so both rank.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable accessibilityLabel="x" className="${classes}"/>`
const inputs = [
  ['outline-none', 'outline-dashed'],
  ['outline-hidden', 'outline-dotted'],
  ['outline-none', 'outline-2'],
  ['focus:outline-none', 'outline-2', 'outline-dashed'],
  ['outline-hidden', 'p-4', 'p-2'],
]

test('outline-none and outline-hidden settle in Tailwind order, whichever is written first', async () => {
  const names = [...new Set(inputs.flat())]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const authored = prepareAuthoredTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler()
  const native = (classes: string, context = final) =>
    compiler.prepareNativeModule(source(classes)).emit(context).components[0]!
  let differs = 0
  for (const input of inputs) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, input.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    const both = [input, input.toReversed()].map((names) => native(names.join(' ')))
    assert.deepEqual(both[0], both[1], input.join(' '))
    const old = [input, input.toReversed()].map(
      (names) =>
        JSON.stringify(native(names.join(' '), authored)) +
        compiler.prepareWebModule(source(names.join(' '))).emit(authored)[0]!.css,
    )
    if (old[0] !== old[1]) differs++
  }
  assert.ok(differs >= 3, `authored order differed in ${differs}`)
  // On Web a written `none` beats a width's implied style in either order.
  const web = compiler.prepareWebModule(source('outline-2 outline-none')).emit(final)[0]!.css
  assert.match(web, /\.hozo-0 \{[^}]*outline-style: none;/)
})

test('outline-hidden keeps Tailwind’s high contrast fallback for static and runtime Web CSS', async () => {
  const names = ['outline-hidden', 'focus:outline-hidden', 'outline-none']
  const upstream = (await compile('@tailwind utilities;')).build(names)
  const fallback =
    /@media \(forced-colors: active\)\s*\{\s*(?:[^{}]+\{\s*)?outline: 2px solid transparent;\s*outline-offset: 2px;/
  assert.match(upstream, fallback)
  const cache = openCandidateCache()
  cache.scanFile('candidates.ts', JSON.stringify(names.join(' ')), 0)
  const runtimeCss = cache.renderCss()
  assert.match(runtimeCss, fallback)
  assert.match(runtimeCss, /@media \(forced-colors: active\)\s*\{\s*\.outline-hidden\s*\{/)
  assert.match(
    runtimeCss,
    /@media \(forced-colors: active\)\s*\{\s*\.focus\\:outline-hidden:focus\s*\{/,
  )
  const compiler = createCompiler()
  const final = prepareFinalTailwindContext(
    JSON.stringify((await prepareTailwindOrder(css, tailwindPackageDir(), names)).snapshot),
  )
  for (const name of names) {
    const button = source(name).replace(
      'accessibilityLabel=',
      'accessibilityRole="button" accessibilityLabel=',
    )
    const web = compiler.prepareWebModule(button).emit(final)[0]!
    const native = compiler.prepareNativeModule(button).emit(final).components[0]!
    assert.deepEqual(native.diagnostics, [], name)
    assert.equal(fallback.test(web.css), name !== 'outline-none', name)
    if (name.startsWith('focus:')) assert.match(web.css, /:focus/)
  }
})
