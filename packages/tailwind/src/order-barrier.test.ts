import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. The plan capture names unassessed blocks, not whether the whole
// input takes a different path. The corpus counts fully assessed inputs.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'

test('each captured block reports what prevents assessing the full input', async () => {
  const names = ['p-4', 'p-2', 'columns-(--layout)', 'md:p-1', 'cursor-[grab]', 'hover:space-y-2']
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const compiler = createCompiler()
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  const source = `import {View} from '@hozo/core';export const A=()=> <>
    <View className="p-4 p-2"/>
    <View className="p-4 columns-(--layout)"/>
    <View className="md:p-1 cursor-[grab]"/>
    <View className="p-2 hover:space-y-2"/>
    <View className="p-2 nope-not-a-class"/>
  </>`
  const sites = compiler
    .compile(source, undefined, { tailwindPlan: true })
    .flatMap((component) => component.tailwindPlan!.sites)
  const barriers = sites.map((site) =>
    site.blocks.map((block) => [block.candidate, block.barrier ?? null]),
  )
  assert.deepEqual(barriers.slice(0, 4), [
    // Reported over the built-in Tailwind order, which a reporting context
    // now uses: the barrier-free input is already ranked, the others are not.
    [
      ['p-2', null],
      ['p-4', null],
    ],
    [
      ['p-4', null],
      ['columns-(--layout)', 'unmapped-property'],
    ],
    [
      ['md:p-1', null],
      ['cursor-[grab]', 'unmapped-property'],
    ],
    [
      ['p-2', null],
      ['hover:space-y-2', 'unassessed-selector'],
    ],
  ])
})

test('a resting barrier pins its position but does not freeze an adjacent assessed run', async () => {
  const names = ['p-4', 'p-2', 'columns-(--layout)']
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler()
  const web = (classes: string) =>
    compiler
      .prepareWebModule(
        `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`,
      )
      .emit(final)[0]!.css
  // An adjacent run is still assessed; an intervening barrier cannot be crossed.
  assert.equal(web('p-4 p-2'), web('p-2 p-4'))
  assert.equal(web('p-4 p-2 columns-(--layout)'), web('p-2 p-4 columns-(--layout)'))
  assert.match(web('p-4 columns-(--layout) p-2'), /padding-top: 8px/)
  assert.match(web('p-2 columns-(--layout) p-4'), /padding-top: 16px/)
})
