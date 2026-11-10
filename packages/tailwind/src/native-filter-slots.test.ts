import assert from 'node:assert/strict'
import test from 'node:test'
import { compileNative } from '@hozo/compiler'
import { __unstable__loadDesignSystem } from 'tailwindcss'
import { hozoFilterStyles } from '../../engine/src/filter-slots.ts'

test('Native conditional filter slots use Tailwind actual function writers and reader order', async () => {
  const names = [
    'blur-[8px]',
    'brightness-50',
    'contrast-125',
    'grayscale',
    'hue-rotate-30',
    'invert',
    'saturate-150',
    'sepia',
  ]
  const design = await __unstable__loadDesignSystem('@tailwind utilities;')
  const rules = design.candidatesToCss(names)
  assert.ok(rules.every((rule) => typeof rule === 'string'))
  const reader = rules[0]!.match(/(?<!-)filter: ([^;]+);/)?.[1]
  assert.ok(reader, rules[0]!)
  const writers = new Map<string, string>()
  for (const rule of rules) {
    for (const [, name, value] of rule!.matchAll(/(--tw-[\w-]+): ([^;]+);/g))
      writers.set(name!, value!)
  }
  const expected = [...reader.matchAll(/var\((--tw-[\w-]+)/g)]
    .flatMap(([, name]) => writers.get(name!) ?? [])
    .join(' ')
  assert.equal(writers.size, names.length, 'every selected upstream function must be observed')
  for (const classes of [names, names.toReversed()]) {
    const conditional = classes
      .map((name) => `${names.indexOf(name) % 2 ? 'dark' : 'md'}:${name}`)
      .join(' ')
    const result = compileNative(
      `import {View} from '@hozo/core';export const C=()=> <View className="${conditional}"/>`,
    )[0]!
    assert.deepEqual(result.diagnostics, [])
    const expression = result.jsx.match(/style=\{([\s\S]*)\}>/)?.[1]
    assert.ok(expression, result.jsx)
    const value = new Function(
      'hozoStyles',
      'hozoFilterStyles',
      '__hozoBp_md',
      '__hozoDark',
      `return (${expression})`,
    )(new Function(`return (${result.styles})`)(), hozoFilterStyles, true, true)
    const output = Object.assign({}, ...value.flat(Infinity))
    assert.equal(output.filter, expected)
  }
})
