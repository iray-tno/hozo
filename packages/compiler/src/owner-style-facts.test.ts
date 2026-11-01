import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import {
  type CompiledNativeComponent,
  createCompiler,
  type NativeCompileOptions,
  prepareTailwindContext,
} from './index.ts'

const facts = ['disabled', 'aria-selected', 'aria-disabled'] as const
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const Plan=()=> <Pressable className=${JSON.stringify(classes)}/>`
const options = { ownerStyle: true, ownerFacts: facts }
function callback(component: CompiledNativeComponent) {
  assert.ok(component.ownerStyle?.callback)
  assert.deepEqual(component.prelude, [])
  assert.ok(component.runtimeImports.every((name) => name === 'HozoPressable'))
  // Consume the carrier and actual stylesheet, never reparse generated JSX.
  return new Function(
    `const hozoStyles=${component.styles};return (${component.ownerStyle.expression})`,
  )() as (state: object) => unknown[]
}
const flatten = (style: unknown[]): Record<string, unknown> => Object.assign({}, ...style)

test('declared owner booleans use existing guards, including unavailable negation and combinations', () => {
  const compiler = createCompiler()
  for (const [candidate, input, property, value] of [
    ['disabled:opacity-50', 'disabled', 'opacity', 0.5],
    ['not-disabled:opacity-50', 'disabled', 'opacity', 0.5],
    ['enabled:opacity-50', 'disabled', 'opacity', 0.5],
    ['aria-selected:opacity-50', 'aria-selected', 'opacity', 0.5],
    ['not-aria-selected:opacity-50', 'aria-selected', 'opacity', 0.5],
    ['aria-disabled:opacity-50', 'aria-disabled', 'opacity', 0.5],
  ] as const) {
    const component = compiler.compileNativeModule(source(candidate), undefined, undefined, options)
      .components[0]!
    assert.deepEqual(component.ownerStyle?.facts, facts)
    const plan = callback(component)
    const negated = candidate.startsWith('not-') || candidate.startsWith('enabled:')
    for (const absent of [undefined, null, 0, '', 'false'])
      assert.equal(flatten(plan({ [input]: absent }))[property], undefined, candidate)
    assert.equal(flatten(plan({ [input]: !negated }))[property], value, candidate)
    assert.equal(flatten(plan({ [input]: negated }))[property], undefined, candidate)
  }
  const plan = callback(
    compiler.compileNativeModule(
      source('hover:aria-selected:disabled:opacity-50'),
      undefined,
      undefined,
      options,
    ).components[0]!,
  )
  for (const hovered of [false, true])
    for (const selected of [false, true])
      for (const disabled of [false, true])
        assert.equal(
          flatten(plan({ hovered, 'aria-selected': selected, disabled })).opacity,
          hovered && selected && disabled ? 0.5 : undefined,
        )
})

test('facts are per-call inputs and do not widen ordinary output or partial-plan refusals', () => {
  const compiler = createCompiler()
  const input = source('aria-selected:p-3 disabled:opacity-50')
  const before = compiler.compileNativeModule(input)
  assert.ok(before.components[0]!.ownerStyle == null)
  assert.ok(
    compiler.compileNativeModule(input, undefined, undefined, options).components[0]!.ownerStyle,
  )
  assert.deepEqual(compiler.compileNativeModule(input), before)
  const noFacts = compiler.compileNativeModule(source('hover:p-3'), undefined, undefined, {
    ownerStyle: true,
  })
  assert.ok(noFacts.components[0]!.ownerStyle?.facts == null)
  for (const classes of [
    'aria-checked:opacity-50',
    'text-red-500',
    'dark:p-3',
    'md:p-3',
    'grid grid-cols-2',
  ]) {
    const component = compiler.compileNativeModule(source(classes), undefined, undefined, options)
      .components[0]!
    assert.ok(component.ownerStyle == null, classes)
    assert.ok(
      component.diagnostics.some((d) => d.severity === 'error'),
      classes,
    )
  }
  for (const classes of ['aria-selected:opacity-50', 'not-aria-selected:opacity-50']) {
    const component = compiler.compileNativeModule(source(classes), undefined, undefined, {
      ownerStyle: true,
      ownerFacts: ['disabled'],
    }).components[0]!
    assert.ok(component.ownerStyle == null)
    assert.ok(component.diagnostics.some((d) => /explicit aria-selected/.test(d.message)))
  }
  const dynamic = `import {Pressable} from '@hozo/core';export const Plan=()=> <Pressable className={\`p-2 \${extra}\`}/>`
  assert.ok(
    compiler.compileNativeModule(dynamic, undefined, undefined, options).components[0]!
      .ownerStyle == null,
    'semantic residual resolver delivery is not certified',
  )
})

test('raw NAPI rejects invalid declarations on compile and retained preparation', () => {
  const require = createRequire(import.meta.url)
  const raw = new (require('../hozo_napi.node').Compiler)()
  for (const request of [
    { ownerFacts: facts },
    { ownerStyle: false, ownerFacts: [] },
    { ownerStyle: true, ownerFacts: ['selected'] },
    { ownerStyle: true, ownerFacts: ['disabled', 'disabled'] },
  ])
    for (const method of ['compileNativeModule', 'prepareNativeModule'])
      assert.throws(() => raw[method](source('p-2'), undefined, undefined, request), /owner|fact/i)
})

test('retained preparation snapshots fact declarations and consumes its handle exactly once', () => {
  const compiler = createCompiler()
  const input = source('aria-selected:opacity-50')
  const declared = [...facts]
  const mutable: NativeCompileOptions = { ownerStyle: true, ownerFacts: declared }
  const retained = compiler.prepareNativeModule(input, undefined, undefined, mutable)
  declared.splice(1)
  mutable.ownerFacts = ['disabled']
  const context = prepareTailwindContext(
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'owner-fact-unit',
      fingerprint: 'b'.repeat(64),
      stylesheets: [],
      candidates: [],
    }),
  )
  const component = retained.emit(context).components[0]!
  assert.deepEqual(component.ownerStyle?.facts, facts)
  const plan = callback(component)
  assert.equal(flatten(plan({ 'aria-selected': true })).opacity, 0.5)
  assert.throws(() => retained.emit(context), /already been emitted or disposed/)
  const disposed = compiler.prepareNativeModule(input, undefined, undefined, options)
  disposed.dispose()
  assert.throws(() => disposed.emit(context), /already been emitted or disposed/)
})
