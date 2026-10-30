import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareTailwindContext } from './index.ts'

const source = `import {Pressable} from '@hozo/core';
export function Plan({extra}) { return <Pressable className={\`p-2 opacity-100 hover:opacity-50 \${extra}\`}/> }`

test('explicit owner preparation exposes the actual style expression without changing ordinary output', () => {
  const compiler = createCompiler()
  const before = compiler.compileNativeModule(source)
  const prepared = compiler.compileNativeModule(source, undefined, undefined, { ownerStyle: true })
  const { ownerStyle, ...direct } = prepared.components[0]!
  const { ownerStyle: absent, ...ordinary } = before.components[0]!
  assert.ok(absent == null)
  assert.ok(ownerStyle)
  assert.deepEqual(direct, ordinary)
  assert.equal(ownerStyle.callback, true)
  assert.equal(ownerStyle.focusVisible, true)
  assert.ok(prepared.components[0]!.jsx.includes(`style={${ownerStyle.expression}}`))
  assert.deepEqual(
    compiler.compileNativeModule(source),
    before,
    'request must not become mutable compiler state',
  )

  const requests: unknown[] = []
  const callback = new Function(
    'hozoStyles',
    'hozoClasses',
    'extra',
    `return (${ownerStyle.expression})`,
  )(
    { hozo0: { opacity: 1 }, hozo0_hover: { opacity: 0.5 } },
    (value: unknown, state: unknown) => {
      requests.push([value, state])
      return { borderRadius: 7 }
    },
    'rounded-[7px]',
  )
  assert.deepEqual(requests, [], 'building the state callback must not resolve classes')
  const output = callback({ pressed: false, hovered: true, focused: false, focusVisible: false })
  assert.equal(Object.assign({}, ...output.filter(Boolean)).opacity, 0.5)
  assert.equal(requests.length, 1)
})

test('extra host effects, capture and hooks cannot be certified as a partial style-only plan', () => {
  const compiler = createCompiler()
  for (const element of [
    '<View className="p-2"><View/></View>',
    '<View style={{opacity:0.5}} className="p-2"/>',
    '<View className="grid grid-cols-2"/>',
    '<View className="md:p-2"/>',
    '<View className="hover:opacity-50"/>',
    '<Text className="text-red-500"/>',
    '<Pressable disabled className="p-2"/>',
    `<Pressable className={\`p-2 \${input.value}\`}/>`,
    `<Pressable className={\`p-2 \${pressed}\`}/>`,
    '<Pressable className={hot ? "p-2" : "p-3"}/>',
    '<Pressable className="text-red-500"/>',
  ]) {
    const input = `import {View,Text,Pressable} from '@hozo/core'; export function X(){return ${element}}`
    const result = compiler.compileNativeModule(input, undefined, undefined, { ownerStyle: true })
    assert.ok(result.components[0]!.ownerStyle == null, element)
    assert.ok(
      result.components[0]!.diagnostics.some((d) => d.severity === 'error'),
      element,
    )
    assert.equal(result.components[0]!.jsx, compiler.compileNativeModule(input).components[0]!.jsx)
  }
})

test('the style-only request uses the actual compiler theme and is separate from text modes', () => {
  const compiler = createCompiler({ colors: [{ token: 'brand', oklch: '', hex: '#123456' }] })
  const input = `import {View} from '@hozo/core'; export const X=()=> <View className="bg-brand"/>`
  const result = compiler.compileNativeModule(input, undefined, undefined, { ownerStyle: true })
  assert.ok(result.components[0]!.ownerStyle)
  assert.match(result.components[0]!.styles, /#123456/)
  for (const textMode of [
    { textReference: true },
    { textInheritance: true },
    { textStatic: true },
  ]) {
    assert.throws(
      () =>
        compiler.compileNativeModule(input, undefined, undefined, {
          ownerStyle: true,
          ...textMode,
        }),
      /ownerStyle/,
    )
    assert.throws(
      () =>
        compiler.prepareNativeModule(input, undefined, undefined, {
          ownerStyle: true,
          ...textMode,
        }),
      /ownerStyle/,
    )
  }
})

test('retained preparation preserves the per-call carrier request through emission', () => {
  const compiler = createCompiler()
  const input = `import {View} from '@hozo/core'; export const X=()=> <View className="p-2"/>`
  const context = prepareTailwindContext(
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'owner-style-test',
      fingerprint: 'a'.repeat(64),
      stylesheets: [],
      candidates: [
        {
          id: 0,
          candidate: 'p-2',
          status: 'described',
          firstRuleRank: null,
          rules: [
            {
              id: 0,
              candidateId: 0,
              variantOrder: '0',
              important: false,
              propertyOrder: [270],
              declarationCount: 1,
              shape: {
                kind: 'rule',
                selector: '.p-2',
                nodes: [{ kind: 'declaration', property: 'padding', important: false }],
              },
            },
          ],
        },
      ],
    }),
  )
  const retained = compiler.prepareNativeModule(input, undefined, undefined, { ownerStyle: true })
  const emitted = retained.emit(context)
  assert.ok(emitted.components[0]!.ownerStyle)
  assert.equal(emitted.components[0]!.ownerStyle!.callback, false)
  assert.deepEqual(
    emitted.components[0]!.ownerStyle,
    compiler.compileNativeModule(input, undefined, undefined, { ownerStyle: true }).components[0]!
      .ownerStyle,
  )
  assert.throws(() => retained.emit(context), /already been emitted or disposed/)
  assert.ok(compiler.compileNativeModule(input).components[0]!.ownerStyle == null)
})
