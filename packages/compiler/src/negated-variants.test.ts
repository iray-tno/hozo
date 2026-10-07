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
  const source = `import { View, Text, Pressable, Button, Link } from '@hozo/core'
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

test('negated hover alone shares the positive owner and stacks without an ambient hover query', () => {
  for (const primitive of ['Pressable', 'Button']) {
    const negative = compile(`<${primitive} className="opacity-100 not-hover:opacity-50" />`)
    const positive = compile(`<${primitive} className="opacity-100 hover:opacity-50" />`)
    assert.deepEqual(negative.result.diagnostics, [])
    assert.ok(negative.result.jsx.startsWith('<HozoPressable'), negative.result.jsx)
    assert.deepEqual(negative.result.prelude, [])
    assert.deepEqual(negative.result.runtimeImports, positive.result.runtimeImports)
    const negativeStyle = negative.values()[0] as (state: object) => unknown
    const positiveStyle = positive.values()[0] as (state: object) => unknown
    for (const hovered of [false, true, false]) {
      assert.equal(flatten(negativeStyle({ hovered })).opacity, hovered ? 1 : 0.5)
      assert.equal(flatten(positiveStyle({ hovered })).opacity, hovered ? 0.5 : 1)
    }

    const stacked = compile(
      `<${primitive} disabled={off} className="opacity-100 md:not-hover:not-disabled:opacity-50" />`,
    )
    assert.deepEqual(stacked.result.diagnostics, [])
    for (const off of [false, true]) {
      for (const md of [false, true]) {
        const style = stacked.values(off, { checked: false }, false, md)[0] as (
          state: object,
        ) => unknown
        for (const hovered of [false, true]) {
          assert.equal(flatten(style({ hovered })).opacity, md && !off && !hovered ? 0.5 : 1)
        }
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

test('negated focus-only classes activate the existing callback and complement positive states', () => {
  for (const primitive of ['Pressable', 'Button']) {
    const c = compile(
      `<${primitive} className="opacity-100 p-0 not-focus:opacity-50 not-focus-visible:p-4" />`,
    )
    const positive = compile(`<${primitive} className="focus:opacity-50 focus-visible:p-4" />`)
    assert.deepEqual(c.result.diagnostics, [])
    assert.ok(c.result.jsx.startsWith('<HozoPressable'), c.result.jsx)
    assert.ok(c.result.jsx.includes(' hozoFocusVisible'), c.result.jsx)
    assert.deepEqual(c.result.prelude, [])
    assert.deepEqual(c.result.runtimeImports, positive.result.runtimeImports)
    const style = c.values()[0] as (state: object) => unknown
    // Includes both initial and repeated entry/exit, not just one matching render.
    for (const [focused, focusVisible] of [
      [false, false],
      [true, false],
      [false, false],
      [true, true],
      [false, false],
    ]) {
      const value = flatten(style({ focused, focusVisible }))
      assert.equal(value.opacity, focused ? 1 : 0.5)
      assert.equal(value.paddingTop, focusVisible ? 0 : 16)
    }
  }
})

test('positive and negative focus guards share one state without losing either half', () => {
  const c = compile(
    '<Pressable className="focus:opacity-100 not-focus:opacity-50 focus-visible:p-4 not-focus-visible:p-2" />',
  )
  assert.deepEqual(c.result.diagnostics, [])
  const style = c.values()[0] as (state: object) => unknown
  for (const focused of [false, true]) {
    for (const focusVisible of [false, true]) {
      const value = flatten(style({ focused, focusVisible }))
      assert.equal(value.opacity, focused ? 1 : 0.5)
      assert.equal(value.paddingTop, focusVisible ? 16 : 8)
    }
  }
  assert.equal(c.result.jsx.match(/ hozoFocusVisible/g)?.length, 1)
})

test('stacked negated focus stays in its callback alongside breakpoint and prop predicates', () => {
  const c = compile(
    '<Pressable disabled={off} className="opacity-100 md:not-disabled:not-focus:not-focus-visible:opacity-50" />',
  )
  assert.deepEqual(c.result.diagnostics, [])
  for (const off of [false, true]) {
    for (const md of [false, true]) {
      const style = c.values(off, { checked: false }, false, md)[0] as (state: object) => unknown
      for (const focused of [false, true]) {
        for (const focusVisible of [false, true]) {
          assert.equal(
            flatten(style({ focused, focusVisible })).opacity,
            md && !off && !focused && !focusVisible ? 0.5 : 1,
          )
        }
      }
    }
  }
  assert.equal(c.result.prelude.filter((line) => line.includes('useHozoBreakpoint')).length, 1)
})

test('negated focus drives existing opacity, transform and inherited text colour transitions', () => {
  const c = compile(
    '<Pressable className="opacity-100 scale-100 text-gray-500 transition not-focus:opacity-50 not-focus:scale-95 not-focus-visible:text-blue-500">x</Pressable>',
  )
  assert.deepEqual(c.result.diagnostics, [])
  assert.ok(c.result.jsx.includes('hozoTransition='), c.result.jsx)
  for (const marker of ['opacity: true', 'transform: true', 'colors: true', '<HozoText']) {
    assert.ok(c.result.jsx.includes(marker), c.result.jsx)
  }
  const [parent, child] = c.values() as ((state: object) => unknown)[]
  const unfocused = { focused: false, focusVisible: false }
  const focused = { focused: true, focusVisible: true }
  assert.equal(flatten(parent(unfocused)).opacity, 0.5)
  assert.equal(flatten(parent(focused)).opacity, 1)
  assert.notDeepEqual(flatten(parent(unfocused)).transform, flatten(parent(focused)).transform)
  assert.notEqual(flatten(child(unfocused)).color, flatten(child(focused)).color)
})

test('focus-visible text-only variants enable their owner and work for raw and explicit text', () => {
  for (const content of ['x', '<Text>x</Text>']) {
    const c = compile(
      `<Pressable className="focus-visible:text-blue-500 not-focus-visible:text-gray-500">${content}</Pressable>`,
    )
    assert.deepEqual(c.result.diagnostics, [])
    assert.ok(c.result.jsx.startsWith('<HozoPressable'), c.result.jsx)
    assert.ok(c.result.jsx.includes(' hozoFocusVisible'), c.result.jsx)
    const [child] = c.values() as ((state: object) => unknown)[]
    assert.notEqual(
      flatten(child({ focused: true, focusVisible: true })).color,
      flatten(child({ focused: true, focusVisible: false })).color,
    )
  }
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
    '<View className="not-hover:p-4" />',
    '<Text className="not-hover:p-4" />',
    '<View className="md:not-hover:p-4" />',
    '<Pressable><View className="not-hover:p-4" /></Pressable>',
    '<View className="not-focus:p-4" />',
    '<Text className="not-focus-visible:p-4" />',
    '<View className="md:not-focus-visible:p-4" />',
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

test('destination-bearing controls supply their own hover and focus text owner', () => {
  for (const primitive of ['Pressable', 'Button', 'Link']) {
    for (const variant of [
      'hover',
      'not-hover',
      'focus',
      'not-focus',
      'focus-visible',
      'not-focus-visible',
      'active',
    ]) {
      for (const body of [
        `<${primitive} href="/docs" className="${variant}:text-red-500">Docs</${primitive}>`,
        `<Pressable className="hover:opacity-50"><${primitive} href="/docs"><Text className="${variant}:text-red-500">Docs</Text></${primitive}></Pressable>`,
      ]) {
        const c = compile(body)
        assert.deepEqual(c.result.diagnostics, [], body)
        assert.match(c.result.jsx, /<HozoLink hozoLinkComponent=\{HozoPressable\}/)
        assert.ok(c.result.jsx.includes('<HozoText'), `${body}: ${c.result.jsx}`)
      }
    }
  }
})

test('a container wrapper keeps the actual interaction owner instead of a View callback', () => {
  for (const primitive of ['Pressable', 'Button']) {
    for (const utility of ['opacity-50', 'text-red-500']) {
      const body = `<${primitive} className="@container not-hover:${utility}">Label</${primitive}>`
      const c = compile(body)
      assert.deepEqual(c.result.diagnostics, [], body)
      assert.match(c.result.jsx, /hozoContainerComponent=\{HozoPressable\}/)
      assert.ok(c.result.jsx.includes('style={({'), `${body}: ${c.result.jsx}`)
    }
  }
  const supported = compile(
    '<View className="@container"><Button className="not-hover:opacity-50">Label</Button></View>',
  )
  assert.deepEqual(supported.result.diagnostics, [])
  assert.ok(supported.result.jsx.includes('<HozoPressable'), supported.result.jsx)
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
