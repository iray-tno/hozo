import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `animate-*` and the `placeholder-*` colour utility had no
// ownership entry, so an input with one kept its authored order. Native
// also ran the *first* animation written under a condition, where CSS runs
// the last.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const view = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
const field = (classes: string) =>
  `import {TextInput} from '@hozo/core';export const A=()=> <TextInput accessibilityLabel="x" className="${classes}"/>`
const inputs: [string[], (classes: string) => string][] = [
  [['animate-spin', 'animate-pulse'], view],
  [['animate-none', 'animate-spin'], view],
  [['animate-pulse', 'p-4', 'p-2'], view],
  [['motion-safe:animate-pulse', 'animate-spin', 'animate-bounce'], view],
  [['placeholder-red-500', 'placeholder-blue-500'], field],
  [['placeholder-slate-400', 'p-4', 'p-2'], field],
  [['placeholder:text-red-500', 'placeholder-blue-500', 'placeholder-green-500'], field],
]

test('animations and placeholder colours settle in Tailwind order, whichever is written first', async () => {
  const names = [...new Set(inputs.flatMap(([names]) => names))]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const authored = prepareAuthoredTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler()
  const native = (source: string, context = final) =>
    compiler.prepareNativeModule(source).emit(context).components[0]!
  let differs = 0
  for (const [input, source] of inputs) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, input.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    const both = [input, input.toReversed()].map((names) => native(source(names.join(' '))))
    assert.deepEqual(both[0], both[1], input.join(' '))
    const old = [input, input.toReversed()].map(
      (names) =>
        JSON.stringify(native(source(names.join(' ')), authored)) +
        compiler.prepareWebModule(source(names.join(' '))).emit(authored)[0]!.css,
    )
    if (old[0] !== old[1]) differs++
  }
  assert.ok(differs >= 4, `authored order differed in ${differs}`)
  // Tailwind's winners: `animate-spin` after `animate-pulse`, and Native
  // runs that one; `placeholder-red-500` after `placeholder-blue-500`.
  assert.match(
    JSON.stringify(native(view('animate-spin animate-pulse'))),
    /useHozoAnimation\('spin'\)/,
  )
  assert.doesNotMatch(
    JSON.stringify(native(view('animate-spin animate-pulse'))),
    /useHozoAnimation\('pulse'\)/,
  )
  assert.match(
    native(field('placeholder-red-500 placeholder-blue-500')).jsx,
    /placeholderTextColor=\{'#fb2c36'\}/,
  )
  // A `placeholder:` colour still beats the `placeholder-*` utility, as
  // Tailwind's variant does, whichever is written first.
  assert.match(
    native(field('placeholder:text-red-500 placeholder-blue-500')).jsx,
    /placeholderTextColor=\{'#fb2c36'\}/,
  )
  // Neither holds a padding conflict on the old path any more.
  for (const classes of ['p-4 p-2 animate-pulse', 'p-4 p-2 placeholder-slate-400']) {
    const padding = compiler.prepareWebModule(field(classes)).emit(final)[0]!
    assert.match(padding.css, /padding-top: 16px/, classes)
    assert.doesNotMatch(padding.css, /padding-top: 8px/, classes)
  }
})
