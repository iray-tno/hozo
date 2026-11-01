import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createCompiler, prepareTailwindContext } from './index.ts'

const options = {
  ownerStyle: true,
  ownerFacts: ['disabled', 'aria-selected'] as const,
  ownerText: 'split' as const,
}
const source = (classes: string) =>
  `import {Pressable} from '@hozo/primitives';export const Plan=()=> <Pressable className=${JSON.stringify(classes)}/>`

test('explicit split-label preparation retains text and box writes in the existing carrier', () => {
  const compiler = createCompiler()
  const input = source(
    'p-2 text-[#112233] aria-selected:text-[#223344] text-[18px] disabled:font-bold hover:tracking-[1px] leading-[24px]',
  )
  const before = compiler.compileNativeModule(input)
  const component = compiler.compileNativeModule(input, undefined, undefined, options)
    .components[0]!
  assert.equal(component.ownerStyle?.splitText, true)
  assert.equal(component.ownerStyle.callback, true)
  assert.deepEqual(component.prelude, [])
  assert.ok(component.runtimeImports.every((name) => name === 'HozoPressable'))
  assert.doesNotMatch(component.jsx, /hozoTextStyle|<Text/)
  const plan = new Function(
    `const hozoStyles=${component.styles};return (${component.ownerStyle.expression})`,
  )()
  for (const selected of [false, true])
    for (const disabled of [false, true])
      for (const hovered of [false, true]) {
        const style = Object.assign({}, ...plan({ 'aria-selected': selected, disabled, hovered }))
        assert.equal(style.color, selected ? '#223344' : '#112233')
        assert.equal(style.fontSize, 18)
        assert.equal(style.lineHeight, 24)
        assert.equal(style.fontWeight, disabled ? '700' : undefined)
        assert.equal(style.letterSpacing, hovered ? 1 : undefined)
        assert.equal(style.paddingTop, 8)
      }
  assert.deepEqual(compiler.compileNativeModule(input), before, 'no sticky text or fact mode')
  const noText = compiler.compileNativeModule(source('p-2'), undefined, undefined, {
    ownerStyle: true,
  })
  assert.ok(noText.components[0]!.ownerStyle?.splitText == null)
})

test('parent-relative metrics, residuals and child targets cannot be certified as a split label', () => {
  const compiler = createCompiler()
  for (const classes of [
    'p-2 text-[2em]',
    'p-2 text-[2vw]',
    'p-2 leading-tight',
    'p-2 tracking-wide',
    'p-2 *:text-red-500',
    'p-2 transition-colors',
    'p-2 md:text-red-500',
  ]) {
    const root = compiler.compileNativeModule(source(classes), undefined, undefined, options)
      .components[0]!
    assert.ok(root.ownerStyle == null, classes)
    assert.ok(
      root.diagnostics.some((d) => d.severity === 'error'),
      classes,
    )
  }
  const captured = `import {Pressable} from '@hozo/core';const P=()=> <Pressable className={\`p-2 \${extra}\`}/>`
  assert.ok(
    compiler.compileNativeModule(captured, undefined, undefined, options).components[0]!
      .ownerStyle == null,
  )
  const variableWeight = createCompiler({
    colors: [],
    fontWeights: [{ name: 'bold', value: '650' }],
  })
  assert.ok(
    variableWeight.compileNativeModule(source('font-bold'), undefined, undefined, options)
      .components[0]!.ownerStyle == null,
    'unsupported RN weight is not silently dropped from a partial carrier',
  )
})

test('raw NAPI validates the declared text destination at both entry points', () => {
  const require = createRequire(import.meta.url)
  const raw = new (require('../hozo_napi.node').Compiler)()
  for (const request of [
    { ownerText: 'split' },
    { ownerStyle: false, ownerText: 'split' },
    { ownerStyle: true, ownerText: 'inherit' },
    { ownerStyle: true, ownerText: '' },
  ])
    for (const method of ['compileNativeModule', 'prepareNativeModule'])
      assert.throws(() => raw[method](source('p-2'), undefined, undefined, request), /ownerText/)
})

test('retained text preparation keeps its theme and destination snapshot until one-shot emission', () => {
  const compiler = createCompiler({ colors: [{ token: 'brand', oklch: '', hex: '#123456' }] })
  const input = source('text-brand text-[18px]')
  const request = { ...options }
  const retained = compiler.prepareNativeModule(input, undefined, undefined, request)
  Object.assign(request, { ownerText: undefined, ownerStyle: false })
  const context = prepareTailwindContext(
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'owner-text-transport-unit',
      fingerprint: 'c'.repeat(64),
      stylesheets: [],
      candidates: [],
    }),
  )
  const root = retained.emit(context).components[0]!
  assert.equal(root.ownerStyle?.splitText, true)
  assert.match(root.styles, /#123456/)
  assert.match(root.styles, /fontSize: 18/)
  assert.throws(() => retained.emit(context), /already been emitted or disposed/)
})
