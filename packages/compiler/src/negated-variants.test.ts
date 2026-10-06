import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileNative } from './index.ts'

// A StyleSheet entry can exist without ever being used. Execute the JSX
// guards against both states instead of only searching for helper names.
function expressions(jsx: string): string[] {
  const result: string[] = []
  let search = 0
  for (;;) {
    const at = jsx.indexOf('style={', search)
    if (at < 0) return result
    const start = at + 'style={'.length
    let depth = 1
    let end = start
    for (; end < jsx.length; end++) {
      if (jsx[end] === '{') depth++
      if (jsx[end] === '}' && --depth === 0) break
    }
    assert.equal(depth, 0, jsx)
    result.push(jsx.slice(start, end))
    search = end + 1
  }
}

function compile(body: string) {
  const source = `import { View, Pressable } from '@hozo/core'
export function C({ off, state }) { return (${body}) }`
  const [result] = compileNative(source)
  assert.ok(result)
  const sheet = new Function(`return (${result.styles})`)()
  return {
    result,
    values: (
      off = false,
      state = { checked: false },
      motion = false,
      md = false,
      portrait = false,
    ) =>
      expressions(result.jsx).map((expression) =>
        new Function(
          'hozoStyles',
          'off',
          'state',
          '__hozoEnv_motion_reduce',
          '__hozoBp_md',
          '__hozoEnv_portrait',
          `return (${expression})`,
        )(sheet, off, state, motion, md, portrait),
      ),
  }
}

function flatten(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten))
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

test('negated disabled and ARIA props apply only on the opposite state', () => {
  const c = compile(
    '<View disabled={off} accessibilityState={state} className="opacity-100 p-0 not-disabled:opacity-50 not-aria-checked:p-4" />',
  )
  assert.deepEqual(c.result.diagnostics, [])
  for (const off of [false, true]) {
    for (const checked of [false, true]) {
      const style = flatten(c.values(off, { checked })[0])
      assert.equal(style.opacity, off ? 1 : 0.5)
      assert.equal(style.paddingTop, checked ? 0 : 16)
    }
  }
  assert.deepEqual(c.result.prelude, [])
  assert.deepEqual(c.result.runtimeImports, [])
})

test('negated motion query complements the positive query and shares its hook', () => {
  const c = compile('<View className="p-0 motion-reduce:p-4 not-motion-reduce:p-2" />')
  assert.deepEqual(c.result.diagnostics, [])
  assert.equal(flatten(c.values(false, { checked: false }, false)[0]).paddingTop, 8)
  assert.equal(flatten(c.values(false, { checked: false }, true)[0]).paddingTop, 16)
  assert.equal(c.result.prelude.filter((line) => line.includes('useHozoEnvironment')).length, 1)
})

test('stacked negated props and environment queries obey the entire conjunction', () => {
  const c = compile(
    '<View disabled={off} accessibilityState={state} className="opacity-100 md:not-disabled:not-aria-checked:not-motion-reduce:opacity-50" />',
  )
  assert.deepEqual(c.result.diagnostics, [])
  for (const off of [false, true]) {
    for (const checked of [false, true]) {
      for (const motion of [false, true]) {
        for (const md of [false, true]) {
          assert.equal(
            flatten(c.values(off, { checked }, motion, md)[0]).opacity,
            md && !off && !checked && !motion ? 0.5 : 1,
          )
        }
      }
    }
  }
})

test('positive hover plus a negated prop stays inside the existing Pressable callback', () => {
  const c = compile(
    '<Pressable disabled={off} className="opacity-100 md:hover:not-disabled:opacity-50" />',
  )
  assert.deepEqual(c.result.diagnostics, [])
  for (const off of [false, true]) {
    for (const md of [false, true]) {
      const style = c.values(off, { checked: false }, false, md)[0] as (state: object) => unknown
      for (const hovered of [false, true]) {
        assert.equal(flatten(style({ hovered })).opacity, md && hovered && !off ? 0.5 : 1)
      }
    }
  }
})

test('not-first and not-last are decided at build time without hooks', () => {
  const c = compile(
    '<View><View className="p-0 m-0 not-first:p-4 not-last:m-2" /><View className="p-0 m-0 not-first:p-4 not-last:m-2" /></View>',
  )
  assert.deepEqual(c.result.diagnostics, [])
  assert.deepEqual(
    c
      .values()
      .map(flatten)
      .map(({ paddingTop, marginTop }) => [paddingTop, marginTop]),
    [
      [0, 8],
      [16, 0],
    ],
  )
  assert.deepEqual(c.result.prelude, [])
})

test('other supported environment queries reuse their existing predicate', () => {
  const c = compile('<View className="opacity-100 not-portrait:opacity-50" />')
  assert.deepEqual(c.result.diagnostics, [])
  assert.equal(flatten(c.values(false, { checked: false }, false, false, true)[0]).opacity, 1)
  assert.equal(flatten(c.values(false, { checked: false }, false, false, false)[0]).opacity, 0.5)
  assert.equal(c.result.prelude.filter((line) => line.includes('useHozoEnvironment')).length, 1)
})

test('boolean shorthand and explicit disabled values retain both complementary guards', () => {
  for (const [prop, disabled] of [
    ['disabled', true],
    ['disabled={true}', true],
    ['disabled={false}', false],
  ] as const) {
    const c = compile(
      `<Pressable ${prop} className="opacity-100 p-0 not-disabled:opacity-50 not-enabled:p-4" />`,
    )
    assert.deepEqual(c.result.diagnostics, [])
    const style = flatten(c.values()[0])
    assert.equal(style.opacity, disabled ? 1 : 0.5)
    assert.equal(style.paddingTop, disabled ? 16 : 0)
  }
  const c = compile('<Pressable className="p-0 not-enabled:p-4" />')
  assert.deepEqual(c.result.diagnostics, [])
  assert.equal(flatten(c.values()[0]).paddingTop, 0)
})

test('a negated nth predicate inverts only statically known sibling ordinals', () => {
  const c = compile(
    '<View><View className="p-0 not-nth-2:p-4" /><View className="p-0 not-nth-2:p-4" /><View className="p-0 not-nth-2:p-4" /></View>',
  )
  assert.deepEqual(c.result.diagnostics, [])
  assert.deepEqual(
    c
      .values()
      .map(flatten)
      .map((style) => style.paddingTop),
    [16, 0, 16],
  )
  assert.deepEqual(c.result.prelude, [])
})

test('an unreadable or unsupported inner condition remains an explicit refusal', () => {
  for (const body of [
    '<View className="not-disabled:p-4" />',
    '<View className="md:not-first:p-4" />',
    '<View accessibilityState={{ busy: true }} className="not-aria-checked:p-4" />',
    '<View className="not-print:p-4" />',
    '<Pressable className="not-hover:p-4" />',
    '<View className="md:not-focus-within:p-4" />',
  ]) {
    const c = compile(body)
    assert.ok(
      c.result.diagnostics.some((d) => d.code === 'NOT_WIRED_ON_NATIVE'),
      body,
    )
    assert.ok(!c.result.jsx.includes('_not'), `${body}: ${c.result.jsx}`)
  }
})

test('a readable optional ARIA prop can be absent at runtime without throwing', () => {
  const c = compile(
    '<View accessibilityState={state} className="p-0 m-0 aria-checked:p-4 not-aria-checked:m-2" />',
  )
  assert.deepEqual(c.result.diagnostics, [])
  const sheet = new Function(`return (${c.result.styles})`)()
  const evaluate = new Function('hozoStyles', 'state', `return (${expressions(c.result.jsx)[0]})`)
  for (const state of [
    undefined,
    null,
    {},
    { checked: false },
    { checked: true },
    { checked: 'mixed' },
  ]) {
    const style = flatten(evaluate(sheet, state))
    const checked = state?.checked === true
    assert.equal(style.paddingTop, checked ? 16 : 0)
    assert.equal(style.marginTop, checked ? 0 : 8)
  }
})
