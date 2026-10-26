import assert from 'node:assert/strict'
import test from 'node:test'
import { type ClassResolverPlan, createClassResolver } from './class-resolver.ts'

const flatten = (styles: object[]) => Object.assign({}, ...styles)
const data = (): ClassResolverPlan => ({
  schema: 1,
  styles: { base: { color: 'base' }, important: { color: 'important' } },
  states: {
    focus: [[['focused'], { color: 'focus' }, 99]],
    active: [[['pressed'], { color: 'active' }, 1]],
    both: [[['hovered', 'focused'], { color: 'both' }, 0]],
  },
  ordering: { schema: 1, ranks: { base: [0], focus: [1], active: [2], both: [3], important: [4] } },
})

test('one ordered template selects interleaved base/state writes rather than appending state buckets', () => {
  for (const names of ['active base focus both', 'both focus base active']) {
    const resolve = createClassResolver(data())
    for (let bits = 0; bits < 8; bits++) {
      const state = { focused: !!(bits & 1), pressed: !!(bits & 2), hovered: !!(bits & 4) }
      const expected =
        state.focused && state.hovered
          ? 'both'
          : state.pressed
            ? 'active'
            : state.focused
              ? 'focus'
              : 'base'
      assert.equal(flatten(resolve(names, state)).color, expected)
      assert.equal(flatten(resolve(`${names} important`, state)).color, 'important')
    }
  }
})

test('cached hits and state updates neither read rank metadata nor sort again', () => {
  const plan = data()
  let reads = 0
  let cold = true
  plan.ordering.ranks = new Proxy(plan.ordering.ranks, {
    get(target, key: string) {
      assert.ok(cold, 'hot path read ranks')
      reads++
      return target[key]
    },
  })
  const resolve = createClassResolver(plan)
  const state = { focused: false, pressed: false, hovered: false }
  const base = resolve('base focus active both', state)
  assert.equal(reads, 4)
  cold = false
  const sort = Array.prototype.sort
  try {
    Array.prototype.sort = () => {
      throw new Error('hot path sorted')
    }
    for (let bits = 0; bits < 32; bits++)
      resolve('base focus active both', {
        focused: !!(bits & 1),
        pressed: !!(bits & 2),
        hovered: !!(bits & 4),
      })
    assert.equal(resolve('base focus active both', state), base)
  } finally {
    Array.prototype.sort = sort
  }
  assert.equal(reads, 4)
})

test('one unranked object is a barrier and preserves the whole legacy string, not a partial sort', () => {
  const plan = data()
  plan.styles.unknown = { color: 'unknown' }
  const legacy = createClassResolver(plan.styles, {}, undefined, plan.states)
  const planned = createClassResolver(plan)
  for (const names of ['base unknown focus active both', 'both active unknown base focus']) {
    for (let bits = 0; bits < 8; bits++) {
      const state = { focused: !!(bits & 1), pressed: !!(bits & 2), hovered: !!(bits & 4) }
      assert.deepEqual(planned(names, state), legacy(names, state))
    }
  }
})

test('ambient decisions, composition and missing-state warnings retain the existing contracts', (t) => {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message) => warnings.push(message)
  t.after(() => {
    console.warn = warn
  })
  let compositions = 0
  const resolve = createClassResolver({
    schema: 1,
    styles: { base: { color: 'base' } },
    states: {
      rtl: [[['rtl'], { color: 'rtl' }]],
      mixed: [[['rtl', 'hovered'], { color: 'mixed' }]],
    },
    ambient: { rtl: true },
    ordering: { schema: 1, ranks: { base: [0], rtl: [1], mixed: [2] } },
    compose(styles) {
      compositions++
      return styles
    },
  })
  const base = resolve('base rtl mixed')
  assert.equal(compositions, 1)
  assert.equal(flatten(base).color, 'rtl')
  assert.equal(resolve('base rtl mixed', {}), base)
  assert.equal(resolve('base rtl mixed', { hovered: false }), base)
  assert.equal(flatten(resolve('base rtl mixed', { hovered: true })).color, 'mixed')
  assert.equal(compositions, 2)
  assert.equal(warnings.length, 1)
})

test('invalid schema/ranks are explicit errors and a legacy class named schema is still an object', () => {
  assert.throws(
    () => createClassResolver({ ...data(), schema: 2 } as unknown as ClassResolverPlan),
    /schema/,
  )
  for (const rank of [-1, Number.NaN, 0.5, Number.POSITIVE_INFINITY]) {
    const plan = data()
    plan.ordering.ranks = { base: [rank] }
    assert.throws(() => createClassResolver(plan)('base'), /rank/)
  }
  const resolve = createClassResolver({ schema: { color: 'ordinary' } })
  assert.equal(flatten(resolve('schema')).color, 'ordinary')
})
