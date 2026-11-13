import assert from 'node:assert/strict'
import test from 'node:test'

import { compile, compileNative } from './index.ts'

const propNames = [
  'renderItem',
  'ListHeaderComponent',
  'ListEmptyComponent',
  'renderAccessory',
] as const
const shapes = [
  (marker: string) => `<View className="p-1"><Text className="text-sm">${marker}</Text></View>`,
  (marker: string) =>
    `flag ? <View className="m-2"><Text className="font-bold">${marker}</Text></View> : <Text className="p-2">alt-${marker}</Text>`,
  (marker: string) =>
    `<><Text className="text-red-500">${marker}</Text><View className="gap-1"><Text>tail-${marker}</Text></View></>`,
  (marker: string) =>
    `[<Text key="a" className="p-1">${marker}</Text>, <View key="b" className="mt-2"><Text>tail</Text></View>]`,
  (marker: string) =>
    `items.map((item) => <View key={item} className="px-2"><Text className="text-xs">${marker}-{item}</Text></View>)`,
  (marker: string) =>
    `<Pressable accessibilityRole="button" className="pressed:opacity-50 hover:bg-blue-500"><Text className="md:text-lg">${marker}</Text></Pressable>`,
] as const

/** Deterministic fuzzing: a failing seed can be reproduced directly. */
test('nested prop lowering preserves structure and removes every nested className', () => {
  let state = 0x5eed1234
  for (let seed = 0; seed < 80; seed += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const propName = propNames[state % propNames.length]
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const shape = shapes[state % shapes.length]
    const marker = `marker-${seed}`
    const value = `() => (${shape(marker)})`
    const requiredRenderer =
      propName === 'renderItem'
        ? ''
        : ` renderItem={() => <Text className="p-1">row-${seed}</Text>}`
    const source = `import { FlatList, View, Text, Pressable } from '@hozo/core'
export function Fixture({ rows, flag, items }) {
  return <FlatList data={rows} ${propName}={${value}}${requiredRenderer} />
}
`

    const web = compile(source)[0]
    const native = compileNative(source)[0]
    const context = `seed=${seed}, prop=${propName}, source=${source}`

    assert.ok(web, context)
    assert.ok(native, context)
    assert.match(web.jsx, new RegExp(marker), context)
    assert.match(native.jsx, new RegExp(marker), context)
    assert.doesNotMatch(web.jsx, /className="(?:p|m|text|font|gap|px|mt)-/, context)
    assert.doesNotMatch(native.jsx, /className=/, context)
    assert.doesNotMatch(web.jsx, /<(?:View|Text|Pressable)[\s>]/, context)
    assert.ok(web.css.length > 0, context)
    assert.ok(native.styles.length > 0, context)
  }
})

// A spread is carried like any other opaque expression, so the primitives
// written inside it lower too. Each host path that wraps the argument
// (Web's DOM-prop translators, a later prop taken out of it, Native's
// Button props) has to lower it, not copy it.
test('primitives inside a spread are lowered on every host the spread can reach', () => {
  const hosts = ['View', 'Text', 'Pressable', 'Button', 'TextInput', 'Image', 'ScrollView', 'Link']
  for (const host of hosts)
    for (const after of ['', ' testID={id()}', ' className="p-4"']) {
      const source = `import { ${host}, Text } from '@hozo/core'
export const A = () => <${host} {...withFooter(<Text className="p-2">marker</Text>)}${after} />
`
      for (const [backend, output] of [
        ['web', compile(source)[0]],
        ['native', compileNative(source)[0]],
      ] as const) {
        const context = `${backend} <${host}${after}>: ${output?.jsx}`
        assert.ok(output, context)
        assert.match(
          output.jsx,
          /withFooter\(<\w+ (?:className="hozo-\d+"|style=\{hozoStyles\.hozo\d+\})>marker</,
          context,
        )
        assert.doesNotMatch(output.jsx, /className="p-2"/, context)
      }
    }
})
