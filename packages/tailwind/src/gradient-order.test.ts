import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. No gradient write had an ownership entry, and `bg-linear-*`'s rule
// re-declares its position register inside `@supports`, which read as a
// branching rule. So `bg-linear-to-r from-red-500 from-blue-500` started
// blue, where Tailwind emits `from-red-500` last and starts red.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const inputs = [
  ['bg-linear-to-r', 'from-red-500', 'from-blue-500'],
  ['bg-linear-to-r', 'to-red-500', 'to-blue-500'],
  ['bg-linear-to-r', 'via-red-500', 'via-blue-500'],
  ['bg-linear-to-r', 'from-red-500', 'from-10%', 'from-20%'],
  ['bg-linear-to-r', 'from-red-500', 'bg-radial'],
  ['from-red-500', 'bg-linear-to-r', 'bg-none'],
  ['from-red-500', 'bg-linear-to-r', 'bg-linear-to-b'],
]
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('gradient constructors, stops and positions settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(inputs.flat())])
  for (const input of inputs) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, input.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    assert.equal(web[0]!.jsx, web[1]!.jsx, input.join(' '))
    const native = [input, input.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, input.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, input.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, input.join(' '))
  }
})
