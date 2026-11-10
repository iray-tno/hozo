import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { __unstable__loadDesignSystem } from 'tailwindcss'

test('literal backdrop functions follow the actual Tailwind register reader', async () => {
  const names = ['backdrop-opacity-50', 'backdrop-saturate-150', 'backdrop-sepia']
  const design = await __unstable__loadDesignSystem('@tailwind utilities;')
  const upstream = design.candidatesToCss(names)
  assert.ok(upstream.every((rule) => typeof rule === 'string'))
  const readers = upstream.map((rule) => rule!.match(/(?<!-)backdrop-filter: ([^;]+);/)?.[1])
  assert.ok(readers.every((reader) => reader === readers[0]))
  assert.ok(readers[0], 'Tailwind must emit the declaration being compared')
  const selected = new Set(['opacity', 'saturate', 'sepia'])
  const expected = [...readers[0].matchAll(/--tw-backdrop-([a-z-]+)/g)]
    .map((match) => match[1]!)
    .filter((name) => selected.has(name))
  assert.equal(expected.length, 3)
  for (const classes of [names, names.toReversed()]) {
    const source = `import {View} from '@hozo/core';const el=<View className="${classes.join(' ')}"/>`
    const output = createCompiler().compile(source)[0]!.css
    const value = output.match(/(?<!-)backdrop-filter: ([^;]+);/)?.[1]
    assert.ok(value, output)
    assert.deepEqual(
      [...value.matchAll(/([a-z-]+)\(/g)].map((match) => match[1]),
      expected,
    )
  }
})
