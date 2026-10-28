import assert from 'node:assert/strict'
import test from 'node:test'
import { type ClassResolverPlan, createClassResolver } from './class-resolver.ts'

test('negative ARIA predicates use supplied facts in both ordered and legacy maps, never truth from absence', (t) => {
  const warnings: string[] = []
  t.mock.method(console, 'warn', (message: unknown) => warnings.push(String(message)))
  for (const ordered of [false, true]) {
    const plan: ClassResolverPlan = {
      schema: 1,
      styles: { base: { paddingTop: 4 } },
      states: {
        negative: [[['!aria-selected'], { paddingTop: 8 }]],
        both: [[['aria-checked', '!aria-selected'], { paddingTop: 12 }]],
      },
      ordering: { schema: 1, ranks: { base: [0], negative: [1], both: [2] } },
    }
    const resolve = ordered
      ? createClassResolver(plan)
      : createClassResolver(plan.styles, {}, undefined, plan.states)
    const flat = (facts?: Record<string, unknown>) =>
      Object.assign({}, ...resolve('base negative both', facts))
    assert.equal(flat({ 'aria-selected': false, 'aria-checked': false }).paddingTop, 8)
    assert.equal(flat({ 'aria-selected': true, 'aria-checked': true }).paddingTop, 4)
    assert.equal(flat({ 'aria-selected': false, 'aria-checked': true }).paddingTop, 12)
    assert.equal(flat({}).paddingTop, 4)
    assert.equal(
      flat({ '!aria-selected': true }).paddingTop,
      4,
      'encoded predicate is not an owner fact',
    )
    assert.equal(flat().paddingTop, 4)
    assert.equal(warnings.length, (ordered ? 2 : 1) * 2, 'missing facts warn once per candidate')
  }
  assert.ok(warnings.every((message) => message.includes('aria-selected')))
})

test('negative predicates are prepared once; cache hits do not parse keys or read ranks', () => {
  let cold = true
  const keys = new Proxy(Object.freeze(['!aria-selected']), {
    get(target, key, receiver) {
      if (!cold && (key === 'map' || key === 'some' || key === 'every'))
        throw Error('negative key reparsed on hot path')
      return Reflect.get(target, key, receiver)
    },
  })
  const ranks = new Proxy(
    { base: [0], negative: [1] },
    {
      get(target, key, receiver) {
        assert.ok(cold, 'hot path read ranks')
        return Reflect.get(target, key, receiver)
      },
    },
  )
  const resolve = createClassResolver({
    schema: 1,
    styles: { base: { opacity: 1 } },
    states: { negative: [[keys, { opacity: 0.5 }]] },
    ordering: { schema: 1, ranks },
  })
  const initial = resolve('base negative', { 'aria-selected': true })
  cold = false
  for (let i = 0; i < 20; i++) {
    assert.equal(resolve('base negative', { 'aria-selected': false }).at(-1)?.opacity, 0.5)
    assert.equal(resolve('base negative', { 'aria-selected': true }), initial)
  }
})

test('a negated ambient fact is decided once using its actual unencoded key', () => {
  for (const selected of [false, true]) {
    const resolve = createClassResolver(
      {},
      {},
      undefined,
      { negative: [[['!aria-selected'], { opacity: 0.5 }]] },
      { 'aria-selected': selected },
    )
    assert.equal(resolve('negative').length, selected ? 0 : 1)
  }
})
