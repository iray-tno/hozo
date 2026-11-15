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

test('an unranked resting write preserves its tier without freezing the state tier', () => {
  const plan = data()
  plan.styles.unknown = { color: 'unknown' }
  const { focus, active, both } = plan.states!
  focus![0]![2] = active![0]![2] = 256
  both![0]![2] = 512
  const planned = createClassResolver(plan)
  for (const names of ['base unknown focus active both', 'both active unknown base focus']) {
    for (let bits = 0; bits < 8; bits++) {
      const state = { focused: !!(bits & 1), pressed: !!(bits & 2), hovered: !!(bits & 4) }
      assert.equal(
        flatten(planned(names, state)).color,
        state.focused && state.hovered
          ? 'both'
          : state.pressed
            ? 'active'
            : state.focused
              ? 'focus'
              : names.endsWith('focus')
                ? 'base'
                : 'unknown',
      )
    }
  }
})

test('proven independent backgrounds keep the existing ranks only for an admitted string', () => {
  const plan: ClassResolverPlan = {
    schema: 1,
    styles: {
      bg: { backgroundColor: 'blue' },
      second: { backgroundColor: 'green' },
      otherBg: { backgroundColor: 'red' },
    },
    states: {
      small: [[['hovered'], { fontSize: 18 }, 1]],
      large: [[['hovered'], { fontSize: 20 }, 1]],
      unknown: [[['hovered'], { fontSize: 27 }, 1]],
    },
    ordering: {
      schema: 1,
      ranks: { small: [0], large: [1], otherBg: [2] },
      independentColors: ['bg second', 'small large'],
    },
  }
  const resolve = createClassResolver(plan)
  const on = { hovered: true }
  const off = { hovered: false }
  assert.deepEqual(flatten(resolve('large bg small', on)), {
    backgroundColor: 'blue',
    fontSize: 20,
  })
  const resting = resolve('large bg small', off)
  assert.deepEqual(flatten(resting), { backgroundColor: 'blue' })
  assert.equal(resolve('large bg small', off), resting)
  for (const [value, color] of [
    ['bg large bg small', 'blue'],
    ['bg large second small', 'green'],
    ['second large bg small', 'blue'],
  ] as const)
    assert.deepEqual(flatten(resolve(value, on)), { backgroundColor: color, fontSize: 20 })
  for (const value of ['bg large unknown small', 'large unknown small bg'])
    assert.equal(flatten(resolve(value, on)).fontSize, 18, value)
  for (const value of ['bg large otherBg small', 'otherBg large bg small'])
    assert.equal(flatten(resolve(value, on)).fontSize, 20, value)
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

test('assessed state runs keep shared ranks without moving across unranked writes', () => {
  const xl = { fontSize: 20, lineHeight: 28 }
  const lg = { fontSize: 18, lineHeight: 27 }
  const unknown = { fontSize: 99, lineHeight: 101 }
  const combined = { fontSize: 30, lineHeight: 36 }
  const explicit = { fontSize: 19, lineHeight: 41 }
  let readRanks = true
  const resolve = createClassResolver({
    schema: 1,
    styles: { brand: { color: 'blue' } },
    states: {
      xl: [[['hovered'], xl, 256]],
      lg: [[['hovered'], lg, 256]],
      unknown: [[['hovered'], unknown, 256]],
      combined: [[['hovered', 'focused'], combined, 512]],
      explicit: [[['hovered'], explicit, 256]],
    },
    ordering: {
      schema: 1,
      ranks: new Proxy(
        // Even if the order table puts it first, a stronger Native selector
        // is not in the same fallback run as the single-state selectors.
        { combined: [0], lg: [1], xl: [2], explicit: [3] },
        {
          get(target, key: keyof typeof target) {
            assert.ok(readRanks, 'a cached fallback read ranks again')
            return target[key]
          },
        },
      ),
    },
  })
  const facts = { hovered: true, focused: true }
  for (const value of ['brand xl lg', 'brand lg xl']) {
    assert.deepEqual(flatten(resolve(value, facts)), { ...xl, color: 'blue' })
    assert.deepEqual(flatten(resolve(value, { ...facts, hovered: false })), { color: 'blue' })
  }
  assert.deepEqual(resolve('brand xl unknown lg', facts).slice(1), [xl, unknown, lg])
  assert.deepEqual(resolve('brand xl explicit lg', facts).slice(1), [lg, xl, explicit])
  assert.deepEqual(flatten(resolve('brand combined unknown xl lg', facts)), {
    ...combined,
    color: 'blue',
  })
  readRanks = false
  assert.equal(flatten(resolve('brand xl lg', { ...facts, focused: false })).fontSize, 20)
})

test('only the selected state groups need ranks; a legacy whole-tier marker is redundant', () => {
  const plan = data()
  plan.styles.unknown = { color: 'resting' }
  // An unrelated unassessed group from the same namespace must not
  // choose which comparator applies to this request.
  plan.states!.unrelated = [[['pressed'], { opacity: 1 }, 256]]
  let readRanks = true
  plan.ordering.ranks = new Proxy(plan.ordering.ranks, {
    get(target, key: string) {
      assert.ok(readRanks, 'a cached state tier read ranks again')
      return target[key]
    },
  })
  const resolve = createClassResolver(plan)
  const oldSchemaOne = createClassResolver({
    ...plan,
    ordering: { ...plan.ordering, rankedStates: true },
  })
  for (const names of ['active base focus unknown both', 'both base unknown focus active']) {
    const facts = { focused: true, pressed: true, hovered: true }
    assert.equal(flatten(resolve(names, facts)).color, 'both')
    assert.deepEqual(oldSchemaOne(names, facts), resolve(names, facts))
    assert.equal(
      flatten(resolve(names, { focused: false, pressed: false, hovered: false })).color,
      'resting',
    )
  }
  readRanks = false
  assert.equal(
    flatten(
      resolve('active base focus unknown both', { focused: true, pressed: true, hovered: false }),
    ).color,
    'active',
  )
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
